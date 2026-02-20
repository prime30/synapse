/**
 * Shared preview cache invalidation.
 * The actual cache lives in the preview route handler (in-process Map),
 * but other modules (push-queue, sync-dev-theme) need to invalidate it.
 * This module holds a registry of invalidation callbacks.
 */

type InvalidateFn = (projectId: string) => void;

let _invalidate: InvalidateFn | null = null;

export function registerPreviewCacheInvalidator(fn: InvalidateFn) {
  _invalidate = fn;
}

export function invalidatePreviewCache(projectId: string) {
  _invalidate?.(projectId);
}
