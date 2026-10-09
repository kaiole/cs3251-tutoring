/**
 * Direct Supabase Data API attacks against the local stack (`npm run db:start`), using real
 * sessions obtained through the magic-link flow. Proves the database boundary holds even when the
 * application routes are bypassed entirely.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

if (existsSync('.env')) process.loadEnvFile('.env');
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY);

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const run = randomUUID().slice(0, 8);
const emails = {
  tutor: `tutor-${run}@example.test`,
  student: `student-${run}@example.test`,
  otherTutor: `tutor2-${run}@example.test`,
  otherStudent: `student2-${run}@example.test`,
};

describe.skipIf(!configured)('direct Data API access', () => {
  const admin = configured ? createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, opts) : (null as never);
  const anon = configured ? createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, opts) : (null as never);
  const clients: Record<keyof typeof emails, SupabaseClient> = {} as never;
  const ids: Record<string, string> = {};
  let questionId = '';

  async function signedInClient(email: string): Promise<SupabaseClient> {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    const client = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, opts);
    const verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
    if (verified.error) throw verified.error;
    return client;
  }

  beforeAll(async () => {
    for (const [key, email] of Object.entries(emails)) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      ids[key] = data.user.id;
    }
    const { error } = await admin.from('tutoring_pairs').insert([
      { tutor_id: ids.tutor!, student_id: ids.student! },
      { tutor_id: ids.otherTutor!, student_id: ids.otherStudent! },
    ]);
    if (error) throw error;
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      clients[key] = await signedInClient(emails[key]);
    }
  });

  afterAll(async () => {
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id); // cascades
  });

  it('student creates a question; identical retry is idempotent', async () => {
    const requestId = randomUUID();
    const args = { p_request_id: requestId, p_body: 'Why can a reference not be reseated?', p_next_session: true };
    const first = await clients.student.rpc('create_question', args).single<{ id: string }>();
    expect(first.error).toBeNull();
    questionId = first.data!.id;
    const second = await clients.student.rpc('create_question', args).single<{ id: string }>();
    expect(second.data!.id).toBe(questionId);
    const changed = await clients.student.rpc('create_question', { ...args, p_body: 'changed' });
    expect(changed.error?.code).toBe('PT409');
    expect(changed.status).toBe(409);
  });

  it('anonymous requests read and write nothing', async () => {
    const read = await anon.from('questions').select('id');
    expect(read.error).not.toBeNull();
    const rpc = await anon.rpc('create_question', { p_request_id: randomUUID(), p_body: 'x' });
    expect(rpc.error).not.toBeNull();
    const pairs = await anon.from('tutoring_pairs').select('id');
    expect(pairs.data ?? []).toHaveLength(0);
  });

  it('another pair cannot read, reply to or update the question', async () => {
    for (const key of ['otherStudent', 'otherTutor'] as const) {
      const c = clients[key];
      const read = await c.from('questions').select('id').eq('id', questionId);
      expect(read.data).toEqual([]);
      const reply = await c.rpc('add_reply', { p_question_id: questionId, p_request_id: randomUUID(), p_body: 'hi' });
      expect(reply.status).toBe(404);
      const state = await c.rpc('set_question_state', { p_question_id: questionId, p_expected_version: 1, p_action: 'resolve' });
      expect(state.status).toBe(404);
    }
  });

  it('participants cannot write tables directly, even their own rows', async () => {
    const update = await clients.student.from('questions').update({ body_md: 'rewritten' }).eq('id', questionId);
    expect(update.error).not.toBeNull();
    const del = await clients.tutor.from('questions').delete().eq('id', questionId);
    expect(del.error).not.toBeNull();
    const insert = await clients.student.from('replies').insert({
      question_id: questionId, author_id: ids.student!, body_md: 'x', request_id: randomUUID(), request_hash: 'a'.repeat(64),
    });
    expect(insert.error).not.toBeNull();
    const pair = await clients.student.from('tutoring_pairs').update({ active: false }).eq('student_id', ids.student!);
    expect(pair.error).not.toBeNull();
  });

  it('the private outbox and worker functions are unreachable for users', async () => {
    const outbox = await clients.tutor.schema('private' as 'public').from('notification_jobs').select('*');
    expect(outbox.error).not.toBeNull();
    const claim = await clients.tutor.rpc('worker_claim_notification_jobs', { p_site_url: 'https://evil.example' });
    expect(claim.error).not.toBeNull();
  });

  it('signups and passwordless account creation are disabled', async () => {
    const email = `new-${run}@example.test`;
    const signup = await anon.auth.signUp({ email, password: randomUUID() });
    expect(signup.error).not.toBeNull();
    const otp = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    expect(otp.error).not.toBeNull();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === email)).toBe(false);
  });

  it('revoking the pair cuts off the student immediately', async () => {
    await admin.from('tutoring_pairs').update({ active: false }).eq('student_id', ids.student!);
    const read = await clients.student.from('questions').select('id');
    expect(read.data).toEqual([]);
    const reply = await clients.student.rpc('add_reply', { p_question_id: questionId, p_request_id: randomUUID(), p_body: 'x' });
    expect(reply.status).toBe(404);
  });
});
