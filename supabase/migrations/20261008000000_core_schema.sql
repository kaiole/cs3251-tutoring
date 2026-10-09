-- Core schema: tutoring pairs, questions, replies, notification outbox.
--
-- Security model:
--   * Clients (anon/authenticated) get NO table INSERT/UPDATE/DELETE privileges.
--   * Reads: RLS SELECT policies limited to members of an ACTIVE tutoring pair, plus column grants.
--   * Writes: only through the SECURITY DEFINER functions in 20261008000100_rpc.sql, which verify
--     auth.uid(), pair membership, limits, idempotency and versions themselves.
--   * Immutable columns are additionally protected by triggers (defense in depth).
--   * The notification outbox lives in the unexposed `private` schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Configuration (administrative only)
-- ---------------------------------------------------------------------------
create table private.app_config (
  id boolean primary key default true check (id),
  write_limit_per_minute integer not null default 10 check (write_limit_per_minute between 1 and 1000)
);
insert into private.app_config default values;

-- ---------------------------------------------------------------------------
-- Tutoring relationships (administrative changes only)
-- ---------------------------------------------------------------------------
create table public.tutoring_pairs (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint tutoring_pairs_distinct_people check (tutor_id <> student_id),
  constraint tutoring_pairs_unique_people unique (tutor_id, student_id),
  -- Target for the composite FK that ties a question's author to the pair's student.
  constraint tutoring_pairs_id_student unique (id, student_id)
);
-- Initially one active relationship per student.
create unique index tutoring_pairs_one_active_per_student
  on public.tutoring_pairs (student_id) where active;
create index tutoring_pairs_tutor on public.tutoring_pairs (tutor_id) where active;

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null,
  author_id uuid not null,
  body_md text not null,
  title text not null,
  status text not null default 'open',
  next_session boolean not null default false,

  -- Source snapshot: what was open in the student's browser. User-supplied, never verified.
  source_note_id text,
  source_title text,
  source_path text,
  source_heading text,
  source_revision text,
  excerpt_text text,
  excerpt_kind text,
  excerpt_language text,

  request_id uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  version integer not null default 1,

  -- Author must be the pair's student (questions are student-authored only).
  constraint questions_author_is_student
    foreign key (pair_id, author_id) references public.tutoring_pairs (id, student_id) on delete cascade,
  constraint questions_author_fk foreign key (author_id) references auth.users (id) on delete cascade,
  constraint questions_request_unique unique (author_id, request_id),

  constraint questions_status_valid check (status in ('open', 'resolved')),
  constraint questions_resolved_not_flagged check (not (status = 'resolved' and next_session)),
  constraint questions_body_len check (char_length(body_md) between 1 and 20000),
  constraint questions_body_not_blank check (body_md ~ '\S'),
  constraint questions_title_len check (char_length(title) between 1 and 120),
  constraint questions_version_positive check (version >= 1),
  constraint questions_request_hash_fmt check (request_hash ~ '^[0-9a-f]{64}$'),

  -- Source snapshot shape. A general question has no source fields at all.
  constraint questions_source_all_or_none check (
    (source_note_id is null and source_title is null and source_path is null
      and source_heading is null and source_revision is null and excerpt_text is null)
    or (source_note_id is not null and source_title is not null and source_path is not null)
  ),
  constraint questions_source_note_id_fmt check (source_note_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint questions_source_title_len check (char_length(source_title) between 1 and 200),
  constraint questions_source_path_fmt check (
    char_length(source_path) <= 300
    and source_path ~ '^/notes/[A-Za-z0-9/_.-]*$' and source_path !~ '\.\.'
  ),
  constraint questions_source_heading_fmt check (source_heading ~ '^[A-Za-z0-9_-]{1,100}$'),
  constraint questions_source_revision_fmt check (source_revision ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint questions_excerpt_len check (char_length(excerpt_text) between 1 and 5000),
  constraint questions_excerpt_not_blank check (excerpt_text ~ '\S'),
  constraint questions_excerpt_kind_valid check (
    (excerpt_text is null and excerpt_kind is null and excerpt_language is null)
    or (excerpt_text is not null and excerpt_kind in ('text', 'code'))
  ),
  constraint questions_excerpt_language_fmt check (
    excerpt_language is null or (excerpt_kind = 'code' and excerpt_language ~ '^[A-Za-z0-9+#_-]{1,32}$')
  )
);

create index questions_pair_status_activity
  on public.questions (pair_id, status, last_activity_at desc, id);
create index questions_pair_next_session
  on public.questions (pair_id, created_at, id) where status = 'open' and next_session;
create index questions_pair_source_note
  on public.questions (pair_id, source_note_id) where source_note_id is not null;

-- ---------------------------------------------------------------------------
-- Replies (append-only)
-- ---------------------------------------------------------------------------
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body_md text not null,
  request_id uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  constraint replies_request_unique unique (author_id, request_id),
  constraint replies_body_len check (char_length(body_md) between 1 and 20000),
  constraint replies_body_not_blank check (body_md ~ '\S'),
  constraint replies_request_hash_fmt check (request_hash ~ '^[0-9a-f]{64}$')
);
create index replies_question_created on public.replies (question_id, created_at, id);

-- ---------------------------------------------------------------------------
-- Notification outbox (private; worker access via service-role-only functions)
-- ---------------------------------------------------------------------------
create table private.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('question_created', 'reply_created')),
  event_id uuid not null,
  question_id uuid not null references public.questions (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  first_attempt_at timestamptz,
  provider_message_id text check (char_length(provider_message_id) <= 200),
  payload jsonb,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_jobs_event_unique unique (event_type, event_id, recipient_id)
);
create index notification_jobs_due on private.notification_jobs (next_attempt_at)
  where state in ('pending', 'sending');

-- ---------------------------------------------------------------------------
-- Immutability triggers (defense in depth; clients have no UPDATE privilege anyway)
-- ---------------------------------------------------------------------------
create function private.guard_question_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.pair_id is distinct from old.pair_id
    or new.author_id is distinct from old.author_id
    or new.body_md is distinct from old.body_md
    or new.title is distinct from old.title
    or new.source_note_id is distinct from old.source_note_id
    or new.source_title is distinct from old.source_title
    or new.source_path is distinct from old.source_path
    or new.source_heading is distinct from old.source_heading
    or new.source_revision is distinct from old.source_revision
    or new.excerpt_text is distinct from old.excerpt_text
    or new.excerpt_kind is distinct from old.excerpt_kind
    or new.excerpt_language is distinct from old.excerpt_language
    or new.request_id is distinct from old.request_id
    or new.request_hash is distinct from old.request_hash
    or new.created_at is distinct from old.created_at
  then
    raise exception 'question content, ownership and source snapshot are immutable'
      using errcode = '42501';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'question version must advance by one' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger questions_guard_update
  before update on public.questions
  for each row execute function private.guard_question_update();

create function private.guard_reply_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'replies are append-only' using errcode = '42501';
end;
$$;

create trigger replies_guard_update
  before update on public.replies
  for each row execute function private.guard_reply_update();

-- A reply's author must be a participant of the question's pair.
create function private.guard_reply_insert() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.questions q
    join public.tutoring_pairs p on p.id = q.pair_id
    where q.id = new.question_id
      and new.author_id in (p.tutor_id, p.student_id)
  ) then
    raise exception 'reply author is not a participant' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger replies_guard_insert
  before insert on public.replies
  for each row execute function private.guard_reply_insert();

-- Pair membership columns cannot be rewritten; deactivate and create a new pair instead.
create function private.guard_pair_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.tutor_id is distinct from old.tutor_id
    or new.student_id is distinct from old.student_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'pair membership is immutable; deactivate and create a new pair'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tutoring_pairs_guard_update
  before update on public.tutoring_pairs
  for each row execute function private.guard_pair_update();

revoke all on function private.guard_question_update() from public;
revoke all on function private.guard_reply_update() from public;
revoke all on function private.guard_reply_insert() from public;
revoke all on function private.guard_pair_update() from public;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant only reads.
-- ---------------------------------------------------------------------------
revoke all on table public.tutoring_pairs, public.questions, public.replies from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

grant select (id, tutor_id, student_id, active, created_at) on public.tutoring_pairs to authenticated;
grant select (
  id, pair_id, author_id, body_md, title, status, next_session,
  source_note_id, source_title, source_path, source_heading, source_revision,
  excerpt_text, excerpt_kind, excerpt_language,
  created_at, last_activity_at, version
) on public.questions to authenticated;
grant select (id, question_id, author_id, body_md, created_at) on public.replies to authenticated;

-- Administrative path (secret key; scripts/admin only): provision/revoke pairs, inspect and delete
-- records for privacy requests. Never used by user-facing requests.
grant select, insert, update on public.tutoring_pairs to service_role;
grant select, delete on public.questions, public.replies to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.tutoring_pairs enable row level security;
alter table public.tutoring_pairs force row level security;
alter table public.questions enable row level security;
alter table public.questions force row level security;
alter table public.replies enable row level security;
alter table public.replies force row level security;
alter table private.notification_jobs enable row level security;
alter table private.notification_jobs force row level security;
alter table private.app_config enable row level security;
alter table private.app_config force row level security;

create policy tutoring_pairs_member_read on public.tutoring_pairs
  for select to authenticated
  using (active and (select auth.uid()) in (tutor_id, student_id));

create policy questions_member_read on public.questions
  for select to authenticated
  using (
    exists (
      select 1 from public.tutoring_pairs p
      where p.id = questions.pair_id
        and p.active
        and (select auth.uid()) in (p.tutor_id, p.student_id)
    )
  );

create policy replies_member_read on public.replies
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      join public.tutoring_pairs p on p.id = q.pair_id
      where q.id = replies.question_id
        and p.active
        and (select auth.uid()) in (p.tutor_id, p.student_id)
    )
  );
-- No INSERT/UPDATE/DELETE policies: with no privileges and no policies, writes are denied twice over.
-- private.* tables have no policies at all: only table owners (definer functions) can touch them.
