/**
 * Built-in task: warm-embeddings -- EPIC F (stub for EPIC A)
 *
 * Will re-embed files with stale embeddings. Currently a no-op
 * placeholder until EPIC A (Hybrid Memory Search) is implemented.
 */

import { getTaskRunner, type TaskResult } from '../task-runner';

async function warmEmbeddings(): Promise<TaskResult> {
  // TODO: Implement in EPIC A -- re-embed files where updated_at > embedding_updated_at
  return { success: true, message: 'Warm embeddings: not yet implemented (EPIC A)' };
}

// Self-register
getTaskRunner().register({
  name: 'warm-embeddings',
  handler: warmEmbeddings,
  intervalMinutes: 30,
  maxRetries: 3,
});
