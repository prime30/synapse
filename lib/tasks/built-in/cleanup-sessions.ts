/**
 * Built-in task: cleanup-sessions -- EPIC F
 *
 * Archives AI sessions older than 30 days.
 */

import { createServiceClient } from '@/lib/supabase/admin';
import { getTaskRunner, type TaskResult } from '../task-runner';

async function cleanupSessions(): Promise<TaskResult> {
  const supabase = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('ai_sessions')
    .update({ archived_at: new Date().toISOString() })
    .lt('created_at', thirtyDaysAgo)
    .is('archived_at', null)
    .select('id')
    .limit(100);

  if (error) {
    return { success: false, message: `Failed to archive sessions: ${error.message}` };
  }

  const count = data?.length ?? 0;
  return { success: true, message: `Archived ${count} sessions` };
}

// Self-register
getTaskRunner().register({
  name: 'cleanup-sessions',
  handler: cleanupSessions,
  intervalMinutes: 60,
  maxRetries: 3,
});
