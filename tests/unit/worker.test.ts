import { describe, expect, it } from 'vitest';
import {
  composeEmail,
  idempotencyKey,
  parsePayload,
  runNotificationWorker,
  type ClaimedJob,
  type SendResult,
  type Transport,
  type WorkerStore,
} from '../../src/lib/notifications/worker';

const SITE = 'https://tutor.example.test';
const JOB = '7d9f1c2e-4b6a-4c1d-9e8f-0a1b2c3d4e5f';
const payload = { to: 't@example.test', event: 'question_created', recipientRole: 'tutor', threadUrl: `${SITE}/questions/${JOB}` };

function fakeStore(jobs: ClaimedJob[]) {
  const finished: Array<[string, string, string | undefined]> = [];
  const store: WorkerStore = {
    async claim() {
      return jobs.splice(0, jobs.length);
    },
    async finish(jobId, _lease, outcome, providerId, error) {
      finished.push([jobId, outcome, providerId ?? error]);
      return true;
    },
  };
  return { store, finished };
}

const transport = (result: SendResult, seen: string[] = []): Transport => ({
  async send(_email, key) {
    seen.push(key);
    return result;
  },
});

describe('notification worker', () => {
  it('composes generic email without question content', () => {
    const email = composeEmail(parsePayload(payload, SITE)!, 'CS3251 <n@example.test>');
    expect(email.subject).toBe('New question from your student');
    expect(email.text).toContain(`${SITE}/questions/${JOB}`);
    expect(Object.keys(email).sort()).toEqual(['from', 'subject', 'text', 'to']);
  });

  it('rejects payloads linking anywhere but this site', () => {
    expect(parsePayload({ ...payload, threadUrl: `https://evil.example/questions/${JOB}` }, SITE)).toBeNull();
    expect(parsePayload({ ...payload, threadUrl: `${SITE}/questions/${JOB}/../../x` }, SITE)).toBeNull();
    expect(parsePayload({ ...payload, to: 'a@b.c\nBcc: x@y.z' }, SITE)).toBeNull();
  });

  it('sends with a stable job-based idempotency key and records acceptance', async () => {
    const { store, finished } = fakeStore([{ job_id: JOB, lease_token: 'L', attempt_count: 1, payload }]);
    const keys: string[] = [];
    const summary = await runNotificationWorker({
      store, transport: transport({ kind: 'sent', providerId: 'msg_1' }, keys), siteUrl: SITE, from: 'x@example.test',
    });
    expect(keys).toEqual([idempotencyKey(JOB)]);
    expect(finished).toEqual([[JOB, 'sent', 'msg_1']]);
    expect(summary.sent).toBe(1);
  });

  it('schedules a retry when the transport throws', async () => {
    const { store, finished } = fakeStore([{ job_id: JOB, lease_token: 'L', attempt_count: 1, payload }]);
    const throwing: Transport = { send: async () => { throw new Error('boom'); } };
    await runNotificationWorker({ store, transport: throwing, siteUrl: SITE, from: 'x@example.test' });
    expect(finished[0]?.[1]).toBe('retry');
  });

  it('fails jobs with an invalid frozen payload without sending', async () => {
    const { store, finished } = fakeStore([{ job_id: JOB, lease_token: 'L', attempt_count: 1, payload: { to: 'x' } }]);
    const keys: string[] = [];
    await runNotificationWorker({ store, transport: transport({ kind: 'sent', providerId: 'm' }, keys), siteUrl: SITE, from: 'x' });
    expect(keys).toEqual([]);
    expect(finished[0]?.[1]).toBe('failed');
  });
});
