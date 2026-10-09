-- Remove the "next session" flag from questions.
--
-- The write RPCs are redefined without any next_session handling first, then the index, the
-- constraint and the column are dropped. Dropping the column also drops its column-level SELECT
-- grant. Everything else (definer rights, empty search_path, actor from auth.uid(), rate limit,
-- idempotency, notification outbox, grants) is unchanged.
--
-- The create_question idempotency hash no longer includes 'nextSession', so a retry of a request
-- created before this migration hashes differently and receives PT409 instead of the original.

-- ---------------------------------------------------------------------------
-- create_question: drop the p_next_session parameter
-- ---------------------------------------------------------------------------
drop function public.create_question(uuid, text, boolean, jsonb);

-- p_source is null for a general question, otherwise an object with keys:
--   noteId, title, path, heading?, revision?, excerpt?: { text, kind: 'text'|'code', language? }
-- Unknown keys are rejected so the request hash covers exactly what is stored.
create function public.create_question(
  p_request_id uuid,
  p_body text,
  p_source jsonb default null
) returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  pair public.tutoring_pairs;
  existing public.questions;
  created public.questions;
  hash text;
  excerpt jsonb;
begin
  if p_request_id is null or p_body is null then
    raise exception 'request id and body are required' using errcode = '23502';
  end if;

  select * into pair from public.tutoring_pairs p
    where p.student_id = uid and p.active
    for share;
  if not found then
    raise exception 'only an active student can ask questions' using errcode = 'PT403';
  end if;

  if p_source is not null then
    if pg_catalog.jsonb_typeof(p_source) <> 'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(p_source) k
                 where k not in ('noteId', 'title', 'path', 'heading', 'revision', 'excerpt'))
    then
      raise exception 'invalid source' using errcode = '23514';
    end if;
    excerpt := p_source -> 'excerpt';
    if excerpt is not null and pg_catalog.jsonb_typeof(excerpt) = 'null' then
      excerpt := null;
    end if;
    if excerpt is not null and (
      pg_catalog.jsonb_typeof(excerpt) <> 'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(excerpt) k
                 where k not in ('text', 'kind', 'language'))
    ) then
      raise exception 'invalid excerpt' using errcode = '23514';
    end if;
  end if;

  hash := private.request_hash(pg_catalog.jsonb_build_object(
    'kind', 'question',
    'body', p_body,
    'source', p_source
  ));

  -- Serialize this actor's writes, so the idempotency lookup below cannot race a twin request.
  -- An identical retry returns the original record even if the actor is now rate limited.
  perform private.lock_actor(uid);

  select * into existing from public.questions q
    where q.author_id = uid and q.request_id = p_request_id;
  if found then
    if existing.request_hash = hash then
      return existing;
    end if;
    raise exception 'request id reused with a different payload' using errcode = 'PT409';
  end if;

  perform private.enforce_write_limit(uid);

  insert into public.questions (
    pair_id, author_id, body_md, title,
    source_note_id, source_title, source_path, source_heading, source_revision,
    excerpt_text, excerpt_kind, excerpt_language,
    request_id, request_hash
  ) values (
    pair.id, uid, p_body, private.derive_title(p_body),
    p_source ->> 'noteId', p_source ->> 'title', p_source ->> 'path',
    p_source ->> 'heading', p_source ->> 'revision',
    excerpt ->> 'text', excerpt ->> 'kind', excerpt ->> 'language',
    p_request_id, hash
  ) returning * into created;

  insert into private.notification_jobs (event_type, event_id, question_id, recipient_id)
  values ('question_created', created.id, created.id, pair.tutor_id);

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_reply: same behavior; question summary no longer carries next_session
-- ---------------------------------------------------------------------------
create or replace function public.add_reply(
  p_question_id uuid,
  p_request_id uuid,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  q public.questions;
  pair public.tutoring_pairs;
  existing public.replies;
  created public.replies;
  hash text;
begin
  if p_question_id is null or p_request_id is null or p_body is null then
    raise exception 'question id, request id and body are required' using errcode = '23502';
  end if;

  select * into q from public.questions where id = p_question_id for update;
  if found then
    select * into pair from public.tutoring_pairs p where p.id = q.pair_id and p.active;
  end if;
  if q.id is null or pair.id is null or uid not in (pair.tutor_id, pair.student_id) then
    raise exception 'question not found' using errcode = 'PT404';
  end if;

  hash := private.request_hash(pg_catalog.jsonb_build_object(
    'kind', 'reply', 'questionId', p_question_id, 'body', p_body
  ));

  perform private.lock_actor(uid);

  select * into existing from public.replies r
    where r.author_id = uid and r.request_id = p_request_id;
  if found then
    if existing.request_hash = hash then
      return pg_catalog.jsonb_build_object(
        'reply', pg_catalog.to_jsonb(existing) - 'request_id' - 'request_hash',
        'question', pg_catalog.jsonb_build_object('id', q.id, 'status', q.status,
          'version', q.version, 'last_activity_at', q.last_activity_at)
      );
    end if;
    raise exception 'request id reused with a different payload' using errcode = 'PT409';
  end if;

  perform private.enforce_write_limit(uid);

  insert into public.replies (question_id, author_id, body_md, request_id, request_hash)
  values (q.id, uid, p_body, p_request_id, hash)
  returning * into created;

  update public.questions
    set status = 'open',
        last_activity_at = created.created_at,
        version = version + 1
    where id = q.id
    returning * into q;

  insert into private.notification_jobs (event_type, event_id, question_id, recipient_id)
  values (
    'reply_created', created.id, q.id,
    case when uid = pair.tutor_id then pair.student_id else pair.tutor_id end
  );

  return pg_catalog.jsonb_build_object(
    'reply', pg_catalog.to_jsonb(created) - 'request_id' - 'request_hash',
    'question', pg_catalog.jsonb_build_object('id', q.id, 'status', q.status,
      'version', q.version, 'last_activity_at', q.last_activity_at)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_question_state: resolve / reopen only
-- ---------------------------------------------------------------------------
create or replace function public.set_question_state(
  p_question_id uuid,
  p_expected_version integer,
  p_action text
) returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  q public.questions;
  pair public.tutoring_pairs;
begin
  if p_action is null or p_action not in ('resolve', 'reopen') then
    raise exception 'invalid action' using errcode = '23514';
  end if;

  select * into q from public.questions where id = p_question_id for update;
  if found then
    select * into pair from public.tutoring_pairs p where p.id = q.pair_id and p.active;
  end if;
  if q.id is null or pair.id is null or uid not in (pair.tutor_id, pair.student_id) then
    raise exception 'question not found' using errcode = 'PT404';
  end if;

  if p_expected_version is null or q.version <> p_expected_version then
    raise exception 'question changed; refresh and try again' using errcode = 'PT409';
  end if;

  update public.questions
    set status = case p_action
                   when 'resolve' then 'resolved'
                   else 'open'
                 end,
        version = version + 1
    where id = q.id
    returning * into q;

  return q;
end;
$$;

revoke all on function public.create_question(uuid, text, jsonb) from public, anon;
revoke all on function public.add_reply(uuid, uuid, text) from public, anon;
revoke all on function public.set_question_state(uuid, integer, text) from public, anon;
grant execute on function public.create_question(uuid, text, jsonb) to authenticated;
grant execute on function public.add_reply(uuid, uuid, text) to authenticated;
grant execute on function public.set_question_state(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Schema: drop the flag
-- ---------------------------------------------------------------------------
drop index public.questions_pair_next_session;
alter table public.questions drop constraint questions_resolved_not_flagged;
alter table public.questions drop column next_session;
