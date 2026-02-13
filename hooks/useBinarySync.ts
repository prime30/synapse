'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';

/**
 * Background post-import sync hook.
 *
 * After the user enters the IDE, this hook:
 * 1. Checks for binary_pending files → syncs them (downloads from CDN)
 * 2. Pushes pending files to the dev theme on Shopify
 *
 * Returns `percent`:
 *   - `null`  → idle or done (indicator hidden)
 *   - `0-100` → sync in progress (indicator visible)
 */
export function useBinarySync(projectId: string | null) {
  const [percent, setPercent] = useState<number | null>(null);
  const baseCountRef = useRef<number | null>(null);
  const totalRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const triggeredRef = useRef(false);

  const retry = useCallback(() => {
    triggeredRef.current = false;
    setPercent(null);
  }, []);

  useEffect(() => {
    if (!projectId || triggeredRef.current) return;
    cancelledRef.current = false;
    triggeredRef.current = true;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        // ── Phase 1: Binary asset sync ──────────────────────────────
        const checkRes = await fetch(`/api/projects/${projectId}/sync-binary`);
        if (!checkRes.ok || cancelledRef.current) {
          // No binary check available — skip to dev theme push
          await pushDevTheme(projectId);
          return;
        }
        const checkData = await checkRes.json();
        const pending = checkData.data?.pending ?? 0;

        if (pending > 0) {
          totalRef.current = pending;
          setPercent(0);

          // Snapshot baseline file count
          const baseRes = await fetch(`/api/projects/${projectId}/files/count`);
          if (baseRes.ok) {
            const baseData = await baseRes.json();
            baseCountRef.current = baseData.data?.count ?? 0;
          }

          // Fire binary sync POST
          const syncPromise = fetch(`/api/projects/${projectId}/sync-binary`, {
            method: 'POST',
          });

          // Poll for progress
          pollTimer = setInterval(async () => {
            if (cancelledRef.current) return;
            try {
              const res = await fetch(`/api/projects/${projectId}/files/count`);
              if (!res.ok) return;
              const data = await res.json();
              const current = (data.data?.count ?? 0) - (baseCountRef.current ?? 0);
              const pct = Math.min(
                Math.round((current / totalRef.current) * 100),
                100
              );
              setPercent(pct);
            } catch {
              // Polling failure is non-critical
            }
          }, 500);

          await syncPromise;
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
        }

        // ── Phase 2: Dev theme push (fire-and-forget from UI perspective) ──
        // This runs silently — no percentage indicator for the push phase
        // since it's not user-visible progress (files are already in the IDE).
        if (!cancelledRef.current) {
          setPercent(100);
          // Start dev theme push in background (non-blocking for UI)
          pushDevTheme(projectId);
          setTimeout(() => {
            if (!cancelledRef.current) setPercent(null);
          }, 1200);
        }
      } catch {
        if (pollTimer) clearInterval(pollTimer);
        if (!cancelledRef.current) setPercent(null);
      }
    })();

    return () => {
      cancelledRef.current = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [projectId]);

  return { percent, retry };
}

/** Fire-and-forget dev theme push — runs after binary sync completes */
async function pushDevTheme(projectId: string): Promise<void> {
  try {
    const res = await fetch(`/api/projects/${projectId}/sync-dev-theme`, {
      method: 'POST',
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if ((json.data?.pushed ?? 0) > 0) {
        // Files were pushed to the dev theme — trigger preview refresh
        emitPreviewSyncComplete(projectId);
      }
    }
  } catch {
    // Dev theme push failure is non-critical from the user's perspective
  }
}
