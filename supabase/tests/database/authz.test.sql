-- Authorization, immutability, lifecycle, idempotency and limits — exercised as the real
-- Data API roles (anon / authenticated), not just through application routes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

-- ---------------------------------------------------------------------------
-- Fixtures: tutor T + student S (pair A), tutor T2 + student S2 (pair B), unpaired U.
-- ---------------------------------------------------------------------------
-- Isolate from any local dev data (the whole suite is rolled back at the end).
delete from private.notification_jobs;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', 't@example.test', 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 's@example.test', 'authenticated', 'authenticated', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 't2@example.test', 'authenticated', 'authenticated', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 's2@example.test', 'authenticated', 'authenticated', now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'u@example.test', 'authenticated', 'authenticated', now(), now());

insert into public.tutoring_pairs (id, tutor_id, student_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');

-- ---------------------------------------------------------------------------
-- Schema shape: the next-session flag is gone; clients hold no UPDATE privilege on questions.
-- ---------------------------------------------------------------------------
select hasnt_function('public', 'create_question', array['uuid', 'text', 'boolean', 'jsonb'],
  'old 4-argument create_question (with p_next_session) no longer exists');
select has_function('public', 'create_question', array['uuid', 'text', 'jsonb'],
  '3-argument create_question exists');
select hasnt_column('public', 'questions', 'next_session', 'questions.next_session column is dropped');
select ok(not has_any_column_privilege('authenticated', 'public.questions', 'UPDATE'),
  'authenticated has no UPDATE privilege on questions (table or any column)');

-- Grant the test roles access to temp results produced below.
create temp table ids (name text primary key, id uuid, version int) on commit drop;
grant all on ids to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anonymous visitor: no reads, no writes, no RPCs.
-- ---------------------------------------------------------------------------
set local role anon;
select tests.logout();
select throws_ok($$ select * from public.questions $$, '42501', null, 'anon cannot read questions');
select throws_ok($$ select * from public.replies $$, '42501', null, 'anon cannot read replies');
select throws_ok($$ select * from public.tutoring_pairs $$, '42501', null, 'anon cannot read pairs');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'hi', null) $$,
  '42501', null, 'anon cannot call create_question');
select throws_ok($$ select * from private.notification_jobs $$, '42501', null, 'anon cannot reach private schema');
reset role;

-- authenticated role without a user id (e.g. forged role claim with no sub)
set local role authenticated;
select tests.logout();
select throws_ok($$ select public.create_question(gen_random_uuid(), 'hi', null) $$,
  'PT401', null, 'authenticated role without sub is rejected');
reset role;

-- ---------------------------------------------------------------------------
-- Student S creates questions.
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('22222222-2222-2222-2222-222222222222');

insert into ids select 'q1', q.id, q.version from public.create_question(
  'c0000000-0000-0000-0000-000000000001',
  E'## Why can''t a reference be reseated?\n\nI tried `r = b;`.', null) q;
select is((select title from public.questions where id = (select id from ids where name = 'q1')),
  'Why can''t a reference be reseated?', 'title derived from first meaningful line');
select is((select status from public.questions where id = (select id from ids where name = 'q1')),
  'open', 'new question is open');

-- Idempotent retry: same key + payload returns the same record.
select is((select q.id from public.create_question(
  'c0000000-0000-0000-0000-000000000001',
  E'## Why can''t a reference be reseated?\n\nI tried `r = b;`.', null) q),
  (select id from ids where name = 'q1'), 'identical retry returns the original question');
-- Changed payload with the same key conflicts.
select throws_ok($$ select public.create_question('c0000000-0000-0000-0000-000000000001', 'different', null) $$,
  'PT409', null, 'reused request id with a changed payload conflicts');

-- Contextual question with a code excerpt: whitespace preserved exactly.
insert into ids select 'q2', q.id, q.version from public.create_question(
  'c0000000-0000-0000-0000-000000000002', 'What does this print?',
  jsonb_build_object('noteId', 'cpp-references-pointers', 'title', 'References and pointers',
    'path', '/notes/cpp/references-pointers/', 'heading', 'reference-assignment', 'revision', 'abc123',
    'excerpt', jsonb_build_object('text', E'int a = 1;\n\tint& r = a;\n\n  r = 2;\n', 'kind', 'code', 'language', 'cpp'))) q;
select is((select excerpt_text from public.questions where id = (select id from ids where name = 'q2')),
  E'int a = 1;\n\tint& r = a;\n\n  r = 2;\n', 'code excerpt whitespace is preserved byte-for-byte');

-- Validation at the database boundary.
select throws_ok($$ select public.create_question(gen_random_uuid(), E' \n\t ', null) $$,
  '23514', null, 'whitespace-only body rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), repeat('x', 20001), null) $$,
  '23514', null, 'body over 20,000 characters rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'n1', 'title', 't', 'path', '/notes/a/',
    'excerpt', jsonb_build_object('text', repeat('y', 5001), 'kind', 'text'))) $$,
  '23514', null, 'excerpt over 5,000 characters rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'n1', 'title', 't', 'path', 'javascript:alert(1)')) $$,
  '23514', null, 'non-note source path rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'n1', 'title', 't', 'path', '/notes/../../etc')) $$,
  '23514', null, 'path traversal in source path rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'n1', 'title', 't', 'path', '/notes/a/', 'authorId', 'x')) $$,
  '23514', null, 'unknown source keys rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'N1 <script>', 'title', 't', 'path', '/notes/a/')) $$,
  '23514', null, 'malformed note id rejected');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'q',
  jsonb_build_object('noteId', 'n1', 'title', 't', 'path', '/notes/a/',
    'excerpt', jsonb_build_object('text', 'x', 'kind', 'text', 'language', 'cpp'))) $$,
  '23514', null, 'language only allowed on code excerpts');

-- Direct table writes are denied for every client role, whatever the payload.
select throws_ok($$ insert into public.questions (pair_id, author_id, body_md, title, request_id, request_hash)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'x', 'x',
          gen_random_uuid(), repeat('a', 64)) $$, '42501', null, 'student cannot insert questions directly');
select throws_ok($$ update public.questions set body_md = 'edited' $$, '42501', null,
  'student cannot update question bodies');
select throws_ok($$ update public.questions set status = 'resolved' $$, '42501', null,
  'student cannot update status without the RPC');
select throws_ok($$ delete from public.questions $$, '42501', null, 'student cannot delete questions');
select throws_ok($$ insert into public.replies (question_id, author_id, body_md, request_id, request_hash)
  values ((select id from ids where name = 'q1'), '22222222-2222-2222-2222-222222222222', 'x',
          gen_random_uuid(), repeat('a', 64)) $$, '42501', null, 'student cannot insert replies directly');
select throws_ok($$ update public.tutoring_pairs set student_id = '55555555-5555-5555-5555-555555555555' $$,
  '42501', null, 'student cannot modify pairs');
select throws_ok($$ insert into public.tutoring_pairs (tutor_id, student_id)
  values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'student cannot create pairs');
select throws_ok($$ select request_hash from public.questions $$, '42501', null,
  'internal idempotency columns are not readable');
select throws_ok($$ select * from public.worker_claim_notification_jobs('https://example.test') $$,
  '42501', null, 'student cannot run the notification worker');
select throws_ok($$ select public.worker_finish_notification_job(gen_random_uuid(), gen_random_uuid(), 'sent') $$,
  '42501', null, 'student cannot finish notification jobs');

select is((select count(*)::int from public.questions), 2, 'student sees exactly their two questions');
reset role;

-- One notification job per logical submission, addressed to the tutor (derived from the pair).
select is((select count(*)::int from private.notification_jobs where event_type = 'question_created'), 2,
  'one job per created question despite the retry');
select is((select count(*)::int from private.notification_jobs
           where recipient_id <> '11111111-1111-1111-1111-111111111111' and event_type = 'question_created'), 0,
  'question jobs go only to the pair tutor');

-- ---------------------------------------------------------------------------
-- Other accounts cannot see or touch pair A.
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('44444444-4444-4444-4444-444444444444'); -- S2, another pair's student
select is((select count(*)::int from public.questions), 0, 'other student lists no questions');
select is((select count(*)::int from public.questions where id = (select id from ids where name = 'q1')), 0,
  'other student cannot read a guessed question id');
select is((select count(*)::int from public.tutoring_pairs where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'other student cannot see pair A');
select throws_ok(format($$ select public.add_reply(%L, gen_random_uuid(), 'hi') $$, (select id from ids where name = 'q1')),
  'PT404', null, 'other student cannot reply to pair A');
select throws_ok(format($$ select public.set_question_state(%L, 1, 'resolve') $$, (select id from ids where name = 'q1')),
  'PT404', null, 'other student cannot change pair A state');

select tests.login('33333333-3333-3333-3333-333333333333'); -- T2, another pair's tutor
select is((select count(*)::int from public.questions), 0, 'other tutor lists no questions');
select throws_ok(format($$ select public.add_reply(%L, gen_random_uuid(), 'hi') $$, (select id from ids where name = 'q1')),
  'PT404', null, 'other tutor cannot reply to pair A');

select tests.login('55555555-5555-5555-5555-555555555555'); -- unpaired account
select is((select count(*)::int from public.questions), 0, 'unpaired account lists no questions');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'hi', null) $$,
  'PT403', null, 'unpaired account cannot ask');
select throws_ok($$ select public.add_reply(gen_random_uuid(), gen_random_uuid(), 'hi') $$,
  'PT404', null, 'nonexistent and inaccessible ids are indistinguishable');

-- ---------------------------------------------------------------------------
-- Tutor T: reads, replies, lifecycle.
-- ---------------------------------------------------------------------------
select tests.login('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.questions), 2, 'tutor sees the pair''s questions');
select throws_ok($$ select public.create_question(gen_random_uuid(), 'hi', null) $$,
  'PT403', null, 'tutor question creation is not exposed in v1');

update ids set version = (select version from public.questions where id = ids.id) where name = 'q1';
select is((select q.status from public.set_question_state(
  (select id from ids where name = 'q1'), (select version from ids where name = 'q1'), 'resolve') q),
  'resolved', 'tutor resolves q1');
-- Stale version is rejected.
select throws_ok(format($$ select public.set_question_state(%L, %s, 'reopen') $$,
  (select id from ids where name = 'q1'), (select version from ids where name = 'q1')),
  'PT409', null, 'stale version rejected');
select throws_ok(format($$ select public.set_question_state(%L, %s, 'delete') $$,
  (select id from ids where name = 'q1'), (select version from ids where name = 'q1') + 1),
  '23514', null, 'unknown lifecycle action rejected');
-- The removed next-session actions are unknown actions now.
select throws_ok(format($$ select public.set_question_state(%L, %s, 'flag') $$,
  (select id from ids where name = 'q1'), (select version from ids where name = 'q1') + 1),
  '23514', null, 'removed flag action rejected');
select throws_ok(format($$ select public.set_question_state(%L, %s, 'unflag') $$,
  (select id from ids where name = 'q1'), (select version from ids where name = 'q1') + 1),
  '23514', null, 'removed unflag action rejected');

-- A reply reopens a resolved question atomically and notifies the student.
select is((select (public.add_reply((select id from ids where name = 'q1'),
  'd0000000-0000-0000-0000-000000000001', 'A reference is an alias.') -> 'question' ->> 'status')),
  'open', 'reply reopens a resolved question');
select is((select count(*)::int from public.replies where question_id = (select id from ids where name = 'q1')), 1,
  'tutor reply stored');
select throws_ok(format($$ select public.add_reply(%L, 'd0000000-0000-0000-0000-000000000001', 'changed') $$,
  (select id from ids where name = 'q1')), 'PT409', null, 'reply request id reuse with changed body conflicts');
select throws_ok($$ update public.replies set body_md = 'edited' $$, '42501', null, 'tutor cannot edit replies');

-- Resolve then reopen via the RPC.
update ids set version = (select version from public.questions where id = ids.id) where name = 'q2';
select is((select q.status from public.set_question_state(
  (select id from ids where name = 'q2'), (select version from ids where name = 'q2'), 'resolve') q),
  'resolved', 'tutor resolves q2');
select is((select q.status || '/' || q.version from public.set_question_state(
  (select id from ids where name = 'q2'), (select version from ids where name = 'q2') + 1, 'reopen') q),
  'open/' || ((select version from ids where name = 'q2') + 2), 'tutor reopens q2; version advances');
reset role;

select is((select count(*)::int from private.notification_jobs
  where event_type = 'reply_created' and recipient_id = '22222222-2222-2222-2222-222222222222'), 1,
  'tutor reply notifies the student only');
select is((select count(*)::int from private.notification_jobs), 3,
  'status changes create no notifications');

-- Student reply notifies the tutor.
set local role authenticated;
select tests.login('22222222-2222-2222-2222-222222222222');
select lives_ok(format($$ select public.add_reply(%L, gen_random_uuid(), 'Thanks!') $$,
  (select id from ids where name = 'q1')), 'student replies in own thread');
reset role;
select is((select count(*)::int from private.notification_jobs
  where event_type = 'reply_created' and recipient_id = '11111111-1111-1111-1111-111111111111'), 1,
  'student reply notifies the tutor');

-- ---------------------------------------------------------------------------
-- Write rate limit (10 questions+replies per minute per actor).
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('22222222-2222-2222-2222-222222222222');
-- So far this minute: 2 questions + 1 reply = 3. Seven more succeed, the eleventh fails.
select lives_ok($$ select public.add_reply(id, gen_random_uuid(), 'x') from public.questions, generate_series(1, 7) limit 7 $$,
  'writes up to the limit succeed');
select throws_ok(format($$ select public.add_reply(%L, gen_random_uuid(), 'one too many') $$,
  (select id from ids where name = 'q1')), 'PT429', null, 'write over the limit rejected');
select is((select q.id from public.create_question(
  'c0000000-0000-0000-0000-000000000002', 'What does this print?',
  jsonb_build_object('noteId', 'cpp-references-pointers', 'title', 'References and pointers',
    'path', '/notes/cpp/references-pointers/', 'heading', 'reference-assignment', 'revision', 'abc123',
    'excerpt', jsonb_build_object('text', E'int a = 1;\n\tint& r = a;\n\n  r = 2;\n', 'kind', 'code', 'language', 'cpp'))) q),
  (select id from ids where name = 'q2'), 'identical retry still returns the original while rate limited');
reset role;

-- ---------------------------------------------------------------------------
-- Database invariants hold even for privileged writers.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ update public.questions set body_md = 'rewritten', version = version + 1 where id = %L $$,
  (select id from ids where name = 'q1')), '42501', null, 'question body immutable even for the owner role');
select throws_ok(format($$ update public.questions set pair_id = 'bbbbbbbb-0000-0000-0000-000000000001', version = version + 1 where id = %L $$,
  (select id from ids where name = 'q1')), '42501', null, 'question pair immutable');
select throws_ok($$ insert into public.questions (pair_id, author_id, body_md, title, request_id, request_hash)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'x', 'x',
          gen_random_uuid(), repeat('a', 64)) $$, '23503', null, 'question author must be the pair student');
select throws_ok(format($$ insert into public.replies (question_id, author_id, body_md, request_id, request_hash)
  values (%L, '44444444-4444-4444-4444-444444444444', 'x', gen_random_uuid(), repeat('a', 64)) $$,
  (select id from ids where name = 'q1')), '42501', null, 'reply author must be a participant');

-- ---------------------------------------------------------------------------
-- Revocation: deactivating the pair cuts off access immediately.
-- ---------------------------------------------------------------------------
update public.tutoring_pairs set active = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select tests.login('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.questions), 0, 'revoked student reads nothing');
select throws_ok(format($$ select public.add_reply(%L, gen_random_uuid(), 'hi') $$, (select id from ids where name = 'q1')),
  'PT404', null, 'revoked student cannot reply');
select tests.login('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.questions), 0, 'tutor of a revoked pair reads nothing');
reset role;

select * from finish();
rollback;
