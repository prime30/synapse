/**
 * Barrel used by instrumentation.ts so the dynamic import path resolves
 * from the project root. Re-exports the file watcher entry.
 *
 * NOTE: Turbopack flags Node.js modules in this chain as Edge Runtime
 * warnings during dev. These are safe to ignore — the instrumentation
 * register() function guards with an isNode check before importing this.
 */
export { startFileWatcher } from '@/lib/sync/file-watcher';
