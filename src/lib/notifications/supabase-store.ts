import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaimedJob, WorkerStore } from './worker';

/** Outbox access through the service-role-only worker RPCs. Errors expose SQLSTATE only. */
export function supabaseWorkerStore(admin: SupabaseClient): WorkerStore {
  return {
    async claim(siteUrl, batchSize, leaseSeconds) {
      const { data, error } = await admin.rpc('worker_claim_notification_jobs', {
        p_site_url: siteUrl,
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(`claim failed: ${error.code}`);
      return (data ?? []) as ClaimedJob[];
    },
    async finish(jobId, leaseToken, outcome, providerId, reason) {
      const { data, error } = await admin.rpc('worker_finish_notification_job', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_outcome: outcome,
        ...(providerId ? { p_provider_message_id: providerId } : {}),
        ...(reason ? { p_error: reason } : {}),
      });
      if (error) throw new Error(`finish failed: ${error.code}`);
      return data === true;
    },
  };
}
