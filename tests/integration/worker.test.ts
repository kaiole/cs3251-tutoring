/**
 * Notification worker against the local database: a real question produces exactly one generic
 * email to the pair's tutor, sent once with the job-based idempotency key.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { supabaseWorkerStore } from '../../src/lib/notifications/supabase-store';
import { runNotificationWorker, type Email, type Transport } from '../../src/lib/notifications/worker';

if (existsSync('.env')) process.loadEnvFile('.env');
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY);
const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const SITE = 'https://tutor.example.test';

describe.skipIf(!configured)('notification worker (local database)', () => {
  const admin = configured ? createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, opts) : (null as never);
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  it('sends one generic email per new question, to the tutor only', async () => {
    const run = randomUUID().slice(0, 8);
    const tutorEmail = `wtutor-${run}@example.test`;
    const ids: string[] = [];
    for (const email of [tutorEmail, `wstudent-${run}@example.test`]) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      ids.push(data.user.id);
      created.push(data.user.id);
    }
    await admin.from('tutoring_pairs').insert({ tutor_id: ids[0]!, student_id: ids[1]! });

    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: `wstudent-${run}@example.test` });
    const student = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, opts);
    await student.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: 'email' });
    const secret = `SECRET-${run} int x = 42;`;
    const q = await student.rpc('create_question', { p_request_id: randomUUID(), p_body: secret });
    expect(q.error).toBeNull();
    const questionId = (q.data as { id: string }).id;

    const sent: Array<{ email: Email; key: string }> = [];
    const transport: Transport = {
      async send(email, key) {
        sent.push({ email, key });
        return { kind: 'sent', providerId: `fake-${sent.length}` };
      },
    };
    const store = supabaseWorkerStore(admin);
    await runNotificationWorker({ store, transport, siteUrl: SITE, from: 'n@example.test' });
    const ours = sent.filter((s) => s.email.text.includes(questionId));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.email.to).toBe(tutorEmail);
    expect(ours[0]!.key).toMatch(/^notification-job\/[0-9a-f-]{36}$/);
    expect(JSON.stringify(ours[0]!.email)).not.toContain(`SECRET-${run}`);

    // A second run finds nothing new for this question (no duplicate send).
    sent.length = 0;
    await runNotificationWorker({ store, transport, siteUrl: SITE, from: 'n@example.test' });
    expect(sent.filter((s) => s.email.text.includes(questionId))).toHaveLength(0);
  });
});
