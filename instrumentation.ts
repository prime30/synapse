/**
 * Next.js instrumentation hook.
 *
 * 1. Starts the local file watcher when NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1'
 *    so that edits in .synapse-themes/ flow back to Supabase and Shopify.
 * 2. Starts in-process cron jobs on Fly.io (persistent server) to replace
 *    Vercel Cron. On Vercel, crons are handled by vercel.json instead.
 *
 * Only runs in the Node.js runtime (not Edge).
 */
export async function register() {
  const isNode = typeof process !== 'undefined' && process.versions?.node;
  if (!isNode) return;

  // Start file watcher for local sync (Node.js runtime only). Skip when DISABLE_FILE_WATCHER=1 to avoid Synapse reloads during benchmark/agent runs.
  if (
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1' &&
    process.env.DISABLE_FILE_WATCHER !== '1'
  ) {
    try {
      const { startFileWatcher } = await import('./instrumentation-file-watcher');
      startFileWatcher();
    } catch (err) {
      console.warn('[Instrumentation] Failed to start file watcher:', err);
    }
  }

  // Initialize hybrid router from environment (tuned model canary routing)
  try {
    const { initFromEnv } = await import('./lib/finetune/hybrid-router');
    initFromEnv();
  } catch {
    // Fine-tune module not critical; skip silently
  }

  // In-process cron scheduling for non-Vercel deployments (e.g. Fly.io).
  // On Vercel, crons are handled by vercel.json — skip to avoid double-firing.
  const isVercel = !!process.env.VERCEL;
  if (!isVercel && process.env.NODE_ENV === 'production') {
    try {
      const cron = await import(/* webpackIgnore: true */ 'node-cron');
      const cronSecret = process.env.CRON_SECRET ?? '';
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

      const callCron = async (path: string, label: string) => {
        try {
          const res = await fetch(`${appUrl}${path}`, {
            headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
          });
          console.log(`[Cron] ${label}: ${res.status}`);
        } catch (err) {
          console.error(`[Cron] ${label} failed:`, err);
        }
      };

      // Every 5 minutes: schedule and dispatch background tasks
      cron.schedule('*/5 * * * *', () => callCron('/api/internal/cron', 'task-dispatcher'));

      // Daily at 00:05 UTC: report overage usage to Stripe
      cron.schedule('5 0 * * *', () => callCron('/api/cron/report-overage', 'report-overage'));

      console.log('[Instrumentation] In-process cron jobs scheduled (Fly.io mode)');
    } catch (err) {
      console.warn('[Instrumentation] Failed to start cron scheduler:', err);
    }
  }
}
