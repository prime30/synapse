/**
 * Built-in task: sync-health-check -- EPIC F
 *
 * Verifies Shopify connections are active and tokens are fresh.
 */

import { createServiceClient } from '@/lib/supabase/admin';
import { getTaskRunner, type TaskResult } from '../task-runner';

async function syncHealthCheck(): Promise<TaskResult> {
  const supabase = createServiceClient();

  const { data: connections, error } = await supabase
    .from('shopify_connections')
    .select('id, store_domain, access_token_encrypted, updated_at, sync_status')
    .eq('is_active', true);

  if (error) {
    return { success: false, message: `Failed to query connections: ${error.message}` };
  }

  if (!connections || connections.length === 0) {
    return { success: true, message: 'No active connections to check' };
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let healthy = 0;
  let stale = 0;

  for (const conn of connections) {
    const tokenMissing = !conn.access_token_encrypted;
    const lastUpdated = conn.updated_at ? new Date(conn.updated_at).getTime() : 0;
    const isStale = tokenMissing || lastUpdated < thirtyDaysAgo;

    if (isStale) {
      await supabase
        .from('shopify_connections')
        .update({ sync_status: 'disconnected' })
        .eq('id', conn.id);
      stale++;
    } else {
      healthy++;
    }
  }

  return {
    success: true,
    message: `Health check: ${healthy} healthy, ${stale} stale`,
    data: { healthy, stale },
  };
}

// Self-register
getTaskRunner().register({
  name: 'sync-health-check',
  handler: syncHealthCheck,
  intervalMinutes: 360,
  maxRetries: 2,
});
