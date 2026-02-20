/**
 * Client-safe stub for file-watcher.
 * Used when webpack builds the client so the real file-watcher (which uses fs, path, chokidar, disk-sync) is never bundled.
 */

export function startFileWatcher(): void {
  // no-op on client
}

export function stopFileWatcher(): void {
  // no-op on client
}
