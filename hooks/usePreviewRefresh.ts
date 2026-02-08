'use client';

import { useEffect, useRef } from 'react';
import { PREVIEW_SYNC_EVENT } from '@/lib/preview/sync-listener';

export function usePreviewRefresh(
  projectId: string,
  onRefresh: () => void,
  delayMs = 1000
) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { projectId?: string };
      if (detail?.projectId && detail.projectId !== projectId) return;

      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        onRefresh();
      }, delayMs);
    };

    window.addEventListener(PREVIEW_SYNC_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PREVIEW_SYNC_EVENT, handler as EventListener);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [delayMs, onRefresh, projectId]);
}
