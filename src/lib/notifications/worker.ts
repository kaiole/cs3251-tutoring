/**
 * Notification outbox worker — hosting-independent business logic.
 * netlify/functions/notify.mts is only a thin scheduled wrapper around runNotificationWorker().
 *
 * Guarantees: bounded batches within the platform time limit, leased
 * jobs, frozen generic payloads (no question content), a stable idempotency key per job, and no
 * exactly-once assumption. The database decides recipients; this code never chooses them.
 */

export interface NotificationPayload {
  to: string;
  event: 'question_created' | 'reply_created';
  recipientRole: 'tutor' | 'student';
  threadUrl: string;
}

export interface ClaimedJob {
  job_id: string;
  lease_token: string;
  attempt_count: number;
  payload: unknown;
}

export interface Email {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  | { kind: 'sent'; providerId: string }
  | { kind: 'retry'; reason: string }
  | { kind: 'failed'; reason: string };

export interface WorkerStore {
  claim(siteUrl: string, batchSize: number, leaseSeconds: number): Promise<ClaimedJob[]>;
  finish(
    jobId: string,
    leaseToken: string,
    outcome: 'sent' | 'retry' | 'failed',
    providerId?: string,
    error?: string,
  ): Promise<boolean>;
}

export interface Transport {
  send(email: Email, idempotencyKey: string): Promise<SendResult>;
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+$/;

export function parsePayload(value: unknown, siteUrl: string): NotificationPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  const prefix = `${siteUrl}/questions/`;
  if (
    typeof p.to !== 'string' ||
    !EMAIL_RE.test(p.to) ||
    (p.event !== 'question_created' && p.event !== 'reply_created') ||
    (p.recipientRole !== 'tutor' && p.recipientRole !== 'student') ||
    typeof p.threadUrl !== 'string' ||
    !p.threadUrl.startsWith(prefix) ||
    !/^[0-9a-f-]{36}$/.test(p.threadUrl.slice(prefix.length))
  ) {
    return null;
  }
  return { to: p.to, event: p.event, recipientRole: p.recipientRole, threadUrl: p.threadUrl };
}

/** Generic wording only: never the question title, body, code or quoted passage. */
export function composeEmail(payload: NotificationPayload, from: string): Email {
  const subject =
    payload.event === 'question_created'
      ? 'New question from your student'
      : payload.recipientRole === 'tutor'
        ? 'New reply from your student'
        : 'New reply from your tutor';
  const what =
    payload.event === 'question_created'
      ? 'Your student asked a new question'
      : payload.recipientRole === 'tutor'
        ? 'Your student replied to a question'
        : 'Your tutor replied to your question';
  const text = [
    `${what} in CS3251 Tutoring.`,
    '',
    `Open the thread (sign-in required): ${payload.threadUrl}`,
    '',
    "This email doesn't include the message so that it stays private.",
  ].join('\n');
  return { from, to: payload.to, subject, text };
}

export function idempotencyKey(jobId: string): string {
  return `notification-job/${jobId}`;
}

export interface RunOptions {
  store: WorkerStore;
  transport: Transport;
  siteUrl: string;
  from: string;
  /** Stop claiming new batches after this many ms (platform limit is 30 s). */
  budgetMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  now?: () => number;
}

export interface RunSummary {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

export async function runNotificationWorker(opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? 20_000;
  const batchSize = opts.batchSize ?? 5;
  const summary: RunSummary = { claimed: 0, sent: 0, retried: 0, failed: 0 };

  while (now() - started < budget) {
    const jobs = await opts.store.claim(opts.siteUrl, batchSize, 60);
    if (jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      const payload = parsePayload(job.payload, opts.siteUrl);
      if (!payload) {
        await opts.store.finish(job.job_id, job.lease_token, 'failed', undefined, 'invalid frozen payload');
        summary.failed++;
        continue;
      }
      let result: SendResult;
      try {
        result = await opts.transport.send(composeEmail(payload, opts.from), idempotencyKey(job.job_id));
      } catch {
        result = { kind: 'retry', reason: 'transport error' };
      }
      if (result.kind === 'sent') {
        await opts.store.finish(job.job_id, job.lease_token, 'sent', result.providerId);
        summary.sent++;
      } else if (result.kind === 'retry') {
        await opts.store.finish(job.job_id, job.lease_token, 'retry', undefined, result.reason);
        summary.retried++;
      } else {
        await opts.store.finish(job.job_id, job.lease_token, 'failed', undefined, result.reason);
        summary.failed++;
      }
    }
    if (jobs.length < batchSize) break;
  }
  return summary;
}

/** Resend HTTP API transport. Errors are summarized by status only (bodies may echo addresses). */
export function resendTransport(apiKey: string, timeoutMs = 8_000): Transport {
  return {
    async send(email, key) {
      let res: Response;
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify(email),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // Ambiguous: may have been accepted. Retrying reuses the same idempotency key.
        return { kind: 'retry', reason: 'network error or timeout' };
      }
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
        return { kind: 'sent', providerId: typeof body?.id === 'string' ? body.id : 'unknown' };
      }
      if (res.status === 409 || res.status === 429 || res.status >= 500) {
        return { kind: 'retry', reason: `provider status ${res.status}` };
      }
      return { kind: 'failed', reason: `provider status ${res.status}` };
    },
  };
}

/** Development/preview transport: sends nothing, logs only the job key. */
export const logTransport: Transport = {
  async send(_email, key) {
    console.log(`[notify] log transport: would send ${key}`);
    return { kind: 'sent', providerId: 'log' };
  },
};
