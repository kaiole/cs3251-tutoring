-- Write API: the ONLY way clients mutate tutoring data.
--
-- Every function here is SECURITY DEFINER with an empty search_path and fully-qualified names.
-- Each one derives the actor from auth.uid() (never from arguments), re-checks active pair
-- membership, and performs its whole effect in one transaction.
--
-- Errors use PostgREST's PTxxx convention so direct Data API callers receive the same HTTP
-- status the application routes return:
--   PT401 not authenticated, PT403 not allowed, PT404 not found / not visible (non-disclosing),
--   PT409 idempotency or version conflict, PT429 write rate limit.
-- Malformed input fails the table CHECK constraints (SQLSTATE 23514 / 23502 / 22P02).

-- ---------------------------------------------------------------------------
-- Helpers (private; not executable by clients)
-- ---------------------------------------------------------------------------
create function private.require_uid() returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'PT401';
  end if;
  return uid;
end;
$$;

-- Serialize an actor's writes for the rest of the transaction (idempotency lookups cannot race).
create function private.lock_actor(actor uuid) returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('write:' || actor::text, 0));
$$;

-- Enforce the per-minute write limit across questions + replies. Call after lock_actor.
create function private.enforce_write_limit(actor uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  lim integer;
  recent integer;
begin
  select c.write_limit_per_minute into lim from private.app_config c where c.id;
  select
    (select count(*) from public.questions q
      where q.author_id = actor and q.created_at > now() - interval '1 minute')
    + (select count(*) from public.replies r
      where r.author_id = actor and r.created_at > now() - interval '1 minute')
  into recent;
  if recent >= coalesce(lim, 10) then
    raise exception 'write rate limit exceeded' using errcode = 'PT429';
  end if;
end;
$$;

create function private.request_hash(payload jsonb) returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(payload::text, 'UTF8')), 'hex');
$$;

-- Short inbox title from the first meaningful line. Prose outside code fences wins; falls back to
-- the first code line, then a fixed label. Never more than 120 characters.
create function private.derive_title(body text) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  line text;
  cleaned text;
  candidate text;
  in_fence boolean := false;
  first_code text;
begin
  foreach line in array pg_catalog.regexp_split_to_array(body, E'\r?\n') loop
    if line ~ '^\s{0,3}(```|~~~)' then
      in_fence := not in_fence;
      continue;
    end if;
    cleaned := pg_catalog.regexp_replace(line, '\s+', ' ', 'g');
    cleaned := pg_catalog.regexp_replace(cleaned, '^\s+|\s+$', '', 'g');
    if in_fence then
      if first_code is null and cleaned <> '' then
        first_code := cleaned;
      end if;
      continue;
    end if;
    cleaned := pg_catalog.regexp_replace(cleaned, '^((#{1,6}|>|[-*+]|\d{1,9}[.)])\s*)+', '');
    cleaned := pg_catalog.regexp_replace(cleaned, '^\s+|\s+$', '', 'g');
    if cleaned <> '' then
      candidate := cleaned;
      exit;
    end if;
  end loop;
  candidate := coalesce(nullif(candidate, ''), first_code, 'Untitled question');
  if pg_catalog.char_length(candidate) > 120 then
    candidate := pg_catalog.left(candidate, 119) || '…';
  end if;
  return candidate;
end;
$$;

revoke all on function private.require_uid() from public;
revoke all on function private.lock_actor(uuid) from public;
revoke all on function private.enforce_write_limit(uuid) from public;
revoke all on function private.request_hash(jsonb) from public;
revoke all on function private.derive_title(text) from public;

-- ---------------------------------------------------------------------------
-- create_question
-- ---------------------------------------------------------------------------
-- p_source is null for a general question, otherwise an object with keys:
--   noteId, title, path, heading?, revision?, excerpt?: { text, kind: 'text'|'code', language? }
-- Unknown keys are rejected so the request hash covers exactly what is stored.
create function public.create_question(
  p_request_id uuid,
  p_body text,
  p_next_session boolean default false,
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
    'nextSession', coalesce(p_next_session, false),
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
    pair_id, author_id, body_md, title, next_session,
    source_note_id, source_title, source_path, source_heading, source_revision,
    excerpt_text, excerpt_kind, excerpt_language,
    request_id, request_hash
  ) values (
    pair.id, uid, p_body, private.derive_title(p_body), coalesce(p_next_session, false),
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
-- add_reply: append, atomically reopen, notify the other participant
-- ---------------------------------------------------------------------------
create function public.add_reply(
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
          'next_session', q.next_session, 'version', q.version,
          'last_activity_at', q.last_activity_at)
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
      'next_session', q.next_session, 'version', q.version,
      'last_activity_at', q.last_activity_at)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_question_state: version-checked lifecycle change; never notifies
-- ---------------------------------------------------------------------------
create function public.set_question_state(
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
  if p_action is null or p_action not in ('resolve', 'reopen', 'flag', 'unflag') then
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
                   when 'reopen' then 'open'
                   when 'flag' then 'open'
                   else status
                 end,
        next_session = case p_action
                         when 'resolve' then false
                         when 'flag' then true
                         when 'unflag' then false
                         else next_session
                       end,
        version = version + 1
    where id = q.id
    returning * into q;

  return q;
end;
$$;

revoke all on function public.create_question(uuid, text, boolean, jsonb) from public, anon;
revoke all on function public.add_reply(uuid, uuid, text) from public, anon;
revoke all on function public.set_question_state(uuid, integer, text) from public, anon;
grant execute on function public.create_question(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.add_reply(uuid, uuid, text) to authenticated;
grant execute on function public.set_question_state(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification worker API (service_role only)
-- ---------------------------------------------------------------------------
-- Claims a bounded batch with an expiring lease. Freezes a generic payload on first attempt
-- (no question title, body, code or quote). Skips jobs whose pair is inactive or whose thread or
-- recipient no longer participates. Stops automatic retries of possibly-sent jobs before the
-- provider's 24 h idempotency window closes.
create function public.worker_claim_notification_jobs(
  p_site_url text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 60
) returns table (
  job_id uuid,
  lease_token uuid,
  attempt_count integer,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  job private.notification_jobs;
  recipient_email text;
  pair public.tutoring_pairs;
  base text;
begin
  if p_site_url is null or p_site_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then
    raise exception 'invalid site url' using errcode = '22023';
  end if;
  base := p_site_url;

  -- Possibly-sent jobs (claimed at least once) that are too old for safe automatic retry.
  update private.notification_jobs j
    set state = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'automatic retry window elapsed; reconcile with provider before requeueing',
        updated_at = now()
    where j.state in ('pending', 'sending')
      and j.first_attempt_at is not null
      and j.first_attempt_at < now() - interval '23 hours'
      and (j.state = 'pending' or j.lease_expires_at < now());

  for job in
    select * from private.notification_jobs j
    where (j.state = 'pending' and j.next_attempt_at <= now())
       or (j.state = 'sending' and j.lease_expires_at < now())
    order by j.next_attempt_at
    limit least(greatest(coalesce(p_batch_size, 10), 1), 50)
    for update skip locked
  loop
    pair := null;
    recipient_email := null;
    select p.* into pair
      from public.questions q
      join public.tutoring_pairs p on p.id = q.pair_id
      where q.id = job.question_id;

    if pair.id is null or not pair.active
      or job.recipient_id not in (pair.tutor_id, pair.student_id)
    then
      update private.notification_jobs
        set state = 'skipped', lease_token = null, lease_expires_at = null,
            last_error = 'pair inactive or recipient no longer a participant', updated_at = now()
        where id = job.id;
      continue;
    end if;

    if job.payload is null then
      select u.email into recipient_email from auth.users u where u.id = job.recipient_id;
      if recipient_email is null then
        update private.notification_jobs
          set state = 'skipped', last_error = 'recipient has no email', updated_at = now()
          where id = job.id;
        continue;
      end if;
      job.payload := pg_catalog.jsonb_build_object(
        'to', recipient_email,
        'event', job.event_type,
        'recipientRole', case when job.recipient_id = pair.tutor_id then 'tutor' else 'student' end,
        'threadUrl', base || '/questions/' || job.question_id::text
      );
    end if;

    update private.notification_jobs
      set state = 'sending',
          payload = job.payload,
          lease_token = gen_random_uuid(),
          lease_expires_at = now() + pg_catalog.make_interval(secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600)),
          attempt_count = attempt_count + 1,
          first_attempt_at = coalesce(first_attempt_at, now()),
          updated_at = now()
      where id = job.id
      returning id, private.notification_jobs.lease_token, private.notification_jobs.attempt_count,
                private.notification_jobs.payload
      into job_id, lease_token, attempt_count, payload;
    return next;
  end loop;
end;
$$;

create function public.worker_finish_notification_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.notification_jobs;
  max_attempts constant integer := 8;
begin
  if p_outcome not in ('sent', 'retry', 'failed') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;

  select * into job from private.notification_jobs
    where id = p_job_id and lease_token = p_lease_token and state = 'sending'
    for update;
  if not found then
    return false; -- lease lost; another worker owns or finished it
  end if;

  if p_outcome = 'sent' then
    update private.notification_jobs
      set state = 'sent', provider_message_id = pg_catalog.left(p_provider_message_id, 200),
          lease_token = null, lease_expires_at = null, last_error = null, updated_at = now()
      where id = job.id;
  elsif p_outcome = 'retry' and job.attempt_count < max_attempts then
    update private.notification_jobs
      set state = 'pending',
          next_attempt_at = now() + least(
            pg_catalog.make_interval(mins => (2 ^ job.attempt_count)::integer), interval '2 hours'),
          lease_token = null, lease_expires_at = null,
          last_error = pg_catalog.left(p_error, 500), updated_at = now()
      where id = job.id;
  else
    update private.notification_jobs
      set state = 'failed', lease_token = null, lease_expires_at = null,
          last_error = pg_catalog.left(coalesce(p_error, 'failed'), 500), updated_at = now()
      where id = job.id;
  end if;
  return true;
end;
$$;

revoke all on function public.worker_claim_notification_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.worker_finish_notification_job(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.worker_claim_notification_jobs(text, integer, integer) to service_role;
grant execute on function public.worker_finish_notification_job(uuid, uuid, text, text, text) to service_role;
