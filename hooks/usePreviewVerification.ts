'use client';

import { useRef, useCallback, useState } from 'react';
import { PREVIEW_SYNC_EVENT } from '@/lib/preview/sync-listener';
import { snapshotToDOMElements } from '@/lib/preview/dom-context-formatter';
import {
  compareSnapshots,
  type PreviewVerificationResult,
  type DOMSnapshot as VerifierDOMSnapshot,
} from '@/lib/agents/preview-verifier';
import type { DOMSnapshot } from '@/lib/preview/dom-context-formatter';
import type { PreviewPanelHandle } from '@/components/preview/PreviewPanel';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreviewVerificationState {
  /** Whether a verification cycle is in progress. */
  isVerifying: boolean;
  /** The latest verification result (null if no verification has run). */
  result: PreviewVerificationResult | null;
  /** Error message if verification failed. */
  error: string | null;
}

export interface UsePreviewVerificationReturn extends PreviewVerificationState {
  /**
   * Capture a "before" snapshot. Call this right before sending an agent request.
   * Returns true if the snapshot was captured, false if the preview is unavailable.
   */
  captureBeforeSnapshot: () => Promise<boolean>;
  /**
   * Run the verification: waits for sync to complete, captures "after" snapshot,
   * compares with "before", and returns the result.
   * Only runs if a "before" snapshot was previously captured.
   */
  verify: (projectId: string) => Promise<PreviewVerificationResult | null>;
  /** Clear the verification state (before/after snapshots and result). */
  reset: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** How long to wait for the sync event before timing out. */
const SYNC_TIMEOUT_MS = 8_000;

/** How long to wait after sync before capturing the "after" snapshot (allow re-render). */
const POST_SYNC_DELAY_MS = 1_500;

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook for EPIC V3 Preview Feedback Loop.
 *
 * Captures before/after DOM snapshots around code change application,
 * then runs `compareSnapshots` to detect structural regressions.
 *
 * Usage:
 * 1. Call `captureBeforeSnapshot()` right before sending the agent request.
 * 2. After changes are applied, call `verify(projectId)` -- it waits for the
 *    push sync event, captures the "after" snapshot, and returns the diff.
 */
export function usePreviewVerification(
  previewRef: React.RefObject<PreviewPanelHandle | null>,
): UsePreviewVerificationReturn {
  const beforeSnapshotRef = useRef<DOMSnapshot | null>(null);
  const [state, setState] = useState<PreviewVerificationState>({
    isVerifying: false,
    result: null,
    error: null,
  });

  // ── captureBeforeSnapshot ─────────────────────────────────────────
  const captureBeforeSnapshot = useCallback(async (): Promise<boolean> => {
    if (!previewRef.current) {
      beforeSnapshotRef.current = null;
      return false;
    }

    try {
      const snapshot = await previewRef.current.getRawSnapshot(3_000);
      beforeSnapshotRef.current = snapshot;
      return snapshot !== null;
    } catch {
      beforeSnapshotRef.current = null;
      return false;
    }
  }, [previewRef]);

  // ── verify ────────────────────────────────────────────────────────
  const verify = useCallback(
    async (projectId: string): Promise<PreviewVerificationResult | null> => {
      if (!beforeSnapshotRef.current) {
        return null;
      }

      if (!previewRef.current) {
        setState((prev) => ({ ...prev, error: 'Preview not available' }));
        return null;
      }

      setState({ isVerifying: true, result: null, error: null });

      try {
        // Wait for the push sync event (or timeout)
        await waitForSyncEvent(projectId, SYNC_TIMEOUT_MS);

        // Small delay to let the preview iframe re-render
        await new Promise((resolve) => setTimeout(resolve, POST_SYNC_DELAY_MS));

        // Capture "after" snapshot
        const afterRawSnapshot = await previewRef.current.getRawSnapshot(3_000);
        if (!afterRawSnapshot) {
          setState({ isVerifying: false, result: null, error: 'Failed to capture after snapshot' });
          return null;
        }

        // Convert DOMSnapshot (from dom-context-formatter) to verifier DOMSnapshot format
        const beforeElements = snapshotToDOMElements(beforeSnapshotRef.current);
        const afterElements = snapshotToDOMElements(afterRawSnapshot);

        const beforeVerifier: VerifierDOMSnapshot = {
          url: beforeSnapshotRef.current.url,
          elements: beforeElements,
        };
        const afterVerifier: VerifierDOMSnapshot = {
          url: afterRawSnapshot.url,
          elements: afterElements,
        };

        // Run comparison
        const result = compareSnapshots(beforeVerifier, afterVerifier);

        setState({ isVerifying: false, result, error: null });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Verification failed';
        setState({ isVerifying: false, result: null, error: message });
        return null;
      }
    },
    [previewRef],
  );

  // ── reset ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    beforeSnapshotRef.current = null;
    setState({ isVerifying: false, result: null, error: null });
  }, []);

  return {
    ...state,
    captureBeforeSnapshot,
    verify,
    reset,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a promise that resolves when the PREVIEW_SYNC_EVENT fires
 * for the given project, or rejects on timeout.
 */
function waitForSyncEvent(projectId: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener(PREVIEW_SYNC_EVENT, handler as EventListener);
      // Resolve anyway -- sync may have happened before we started listening,
      // or the file was already pushed. Don't block the verification.
      resolve();
    }, timeoutMs);

    function handler(event: Event) {
      const detail = (event as CustomEvent).detail as { projectId?: string };
      if (detail?.projectId && detail.projectId !== projectId) return;

      clearTimeout(timer);
      window.removeEventListener(PREVIEW_SYNC_EVENT, handler as EventListener);
      resolve();
    }

    window.addEventListener(PREVIEW_SYNC_EVENT, handler as EventListener);
  });
}
