/**
 * Next.js instrumentation hook.
 *
 * File watcher for local sync is started from the sync-to-disk API route
 * (Node runtime only) to avoid pulling Node-only modules (fs, path, chokidar)
 * into the Edge runtime.
 */
export async function register() {
  // Reserved for future instrumentation (e.g. tracing).
}
