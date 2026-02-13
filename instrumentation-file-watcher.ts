/**
 * Barrel used by instrumentation.ts so the dynamic import path resolves
 * from the project root. Re-exports the file watcher entry.
 */
export { startFileWatcher } from '@/lib/sync/file-watcher';
