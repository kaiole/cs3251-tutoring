/**
 * Netlify Scheduled Function wrapper for the notification outbox (runs on published deploys only).
 * All logic lives in src/lib/notifications/worker.ts so hosting can change without rewriting it.
 *
 * Required env (production context only): SITE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY,
 * NOTIFY_FROM, and for real delivery NOTIFY_TRANSPORT=resend + RESEND_API_KEY.
 * Preview/branch contexts must not be given production secrets.
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseWorkerStore } from '../../src/lib/notifications/supabase-store';
import { logTransport, resendTransport, runNotificationWorker } from '../../src/lib/notifications/worker';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export default async (): Promise<void> => {
  const siteUrl = env('SITE_URL').replace(/\/+$/, '');
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const store = supabaseWorkerStore(supabase);

  const transport =
    process.env.NOTIFY_TRANSPORT === 'resend' ? resendTransport(env('RESEND_API_KEY')) : logTransport;

  const summary = await runNotificationWorker({
    store,
    transport,
    siteUrl,
    from: env('NOTIFY_FROM'),
    budgetMs: 20_000, // Netlify scheduled functions are limited to 30 s.
  });
  console.log(`[notify] claimed=${summary.claimed} sent=${summary.sent} retried=${summary.retried} failed=${summary.failed}`);
};

export const config = {
  schedule: '*/5 * * * *',
};
