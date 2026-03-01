export const PREVIEW_SYNC_EVENT = 'shopify-sync-complete';

export function emitPreviewSyncComplete(projectId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PREVIEW_SYNC_EVENT, { detail: { projectId } })
  );
}

/**
 * Poll the push-status endpoint until either:
 * - The server reports a push completed after `savedAt`, or
 * - `maxWaitMs` elapses (defaults to 8 seconds).
 *
 * Returns true if a push was confirmed, false if timed out.
 */
export async function pollForPushCompletion(
  projectId: string,
  savedAt: number,
  maxWaitMs = 8000,
): Promise<boolean> {
  const POLL_INTERVAL = 400;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`/api/projects/${projectId}/push-status`);
      if (res.ok) {
        const data = await res.json();
        const payload = data?.data ?? data;
        const lastPushAt: number | null = payload.lastPushAt ?? null;
        const pending: boolean = payload.hasPendingPush ?? false;

        if (lastPushAt && lastPushAt >= savedAt && !pending) {
          return true;
        }
      }
    } catch {
      // Network hiccup -- keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  return false;
}
