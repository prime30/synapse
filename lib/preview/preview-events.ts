/**
 * In-process event emitter for preview refresh events.
 * SSE endpoints subscribe to these; file-save handlers emit them.
 */

type PreviewEventType = 'preview-refresh' | 'sync-status' | 'theme-swap' | 'external-change';

interface PreviewEvent {
  type: PreviewEventType;
  projectId: string;
  data: Record<string, unknown>;
}

type PreviewListener = (event: PreviewEvent) => void;

const listeners = new Map<string, Set<PreviewListener>>();

export function subscribePreviewEvents(projectId: string, listener: PreviewListener): () => void {
  if (!listeners.has(projectId)) {
    listeners.set(projectId, new Set());
  }
  listeners.get(projectId)!.add(listener);
  return () => {
    const set = listeners.get(projectId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(projectId);
    }
  };
}

export function emitPreviewEvent(event: PreviewEvent): void {
  const set = listeners.get(event.projectId);
  if (set) {
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Convenience: emit a preview-refresh event when a file is saved/pushed */
export function notifyPreviewRefresh(projectId: string, filePath: string): void {
  emitPreviewEvent({
    type: 'preview-refresh',
    projectId,
    data: { filePath, timestamp: Date.now() },
  });
}

/** Convenience: emit sync status update */
export function notifySyncStatus(
  projectId: string,
  status: string,
  pushed?: number,
  total?: number
): void {
  emitPreviewEvent({
    type: 'sync-status',
    projectId,
    data: { status, pushed, total, timestamp: Date.now() },
  });
}

/** Convenience: emit theme swap event */
export function notifyThemeSwap(
  projectId: string,
  oldThemeId: string,
  newThemeId: string
): void {
  emitPreviewEvent({
    type: 'theme-swap',
    projectId,
    data: { oldThemeId, newThemeId, timestamp: Date.now() },
  });
}
