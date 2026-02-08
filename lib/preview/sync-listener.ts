export const PREVIEW_SYNC_EVENT = 'shopify-sync-complete';

export function emitPreviewSyncComplete(projectId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PREVIEW_SYNC_EVENT, { detail: { projectId } })
  );
}
