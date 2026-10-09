-- Notification outbox worker: leases, frozen generic payloads, revocation, retry window.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Isolate from any local dev data (the whole suite is rolled back at the end).
delete from private.notification_jobs;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', 't@example.test', 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 's@example.test', 'authenticated', 'authenticated', now(), now());
insert into public.tutoring_pairs (id, tutor_id, student_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.create_question('c0000000-0000-0000-0000-000000000001',
  E'Secret question text\n```cpp\nint secret = 42;\n```',
  '{"noteId":"cpp-refs","title":"Refs","path":"/notes/refs/","excerpt":{"text":"quoted passage","kind":"text"}}');
reset role;

create temp table claimed on commit drop as
  select * from public.worker_claim_notification_jobs('https://tutor.example.test', 10, 60);

select is((select count(*)::int from claimed), 1, 'worker claims the pending job');
select is((select payload ->> 'to' from claimed), 't@example.test', 'recipient resolved server-side from the pair');
select is((select payload ->> 'threadUrl' from claimed),
  'https://tutor.example.test/questions/' || (select question_id from private.notification_jobs limit 1),
  'payload links to the private thread');
select ok((select payload::text from claimed) !~ '(Secret|secret|42|quoted|Refs)',
  'payload contains no question title, body, code or quote');
select is((select count(*)::int from public.worker_claim_notification_jobs('https://tutor.example.test', 10, 60)), 0,
  'a leased job is not claimed twice');

select is(public.worker_finish_notification_job((select job_id from claimed), gen_random_uuid(), 'sent', 'msg_1'),
  false, 'a wrong lease token cannot finish the job');
select is(public.worker_finish_notification_job((select job_id from claimed), (select lease_token from claimed), 'retry', null, 'timeout'),
  true, 'lease owner can schedule a retry');
select is((select state from private.notification_jobs), 'pending', 'retry returns job to pending');
select ok((select next_attempt_at > now() from private.notification_jobs), 'retry is backed off');

-- Expired lease is reclaimable and keeps the frozen payload (same idempotency key/payload).
update private.notification_jobs set next_attempt_at = now() - interval '1 second';
create temp table reclaimed on commit drop as
  select * from public.worker_claim_notification_jobs('https://other.example.test', 10, 60);
select is((select payload from reclaimed), (select payload from claimed), 'payload frozen across attempts');
select is((select attempt_count from reclaimed), 2, 'attempt count advances');
select is(public.worker_finish_notification_job((select job_id from reclaimed), (select lease_token from reclaimed), 'sent', 'msg_2'),
  true, 'sent recorded');
select is((select state || ':' || provider_message_id from private.notification_jobs), 'sent:msg_2', 'provider id stored');

-- Ambiguous sends older than the provider idempotency window stop retrying automatically.
update private.notification_jobs set state = 'pending', first_attempt_at = now() - interval '23 hours 30 minutes',
  next_attempt_at = now() - interval '1 minute';
select is((select count(*)::int from public.worker_claim_notification_jobs('https://tutor.example.test')), 0,
  'stale possibly-sent job is not retried');
select is((select state from private.notification_jobs), 'failed', 'stale job marked failed for reconciliation');

-- Revoked pair: queued notification is skipped, not sent.
update private.notification_jobs set state = 'pending', first_attempt_at = null, payload = null;
update public.tutoring_pairs set active = false;
select is((select count(*)::int from public.worker_claim_notification_jobs('https://tutor.example.test')), 0,
  'revoked pair produces no sends');

select * from finish();
rollback;
