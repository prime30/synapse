'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDesignScan } from '@/contexts/DesignScanContext';

// ---------------------------------------------------------------------------
// Types matching the API response from GET /api/projects/[projectId]/design-tokens
// ---------------------------------------------------------------------------

export interface DesignTokensResponse {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  spacing: string[];
  radii: string[];
  shadows: string[];
}

export interface DesignTokensData {
  tokens: DesignTokensResponse;
  tokenCount: number;
  fileCount: number;
  analyzedFiles: string[];
}

// ---------------------------------------------------------------------------
// Scan progress types
// ---------------------------------------------------------------------------

export type ScanPhase =
  | 'loading'
  | 'reading'
  | 'extracting'
  | 'inferring'
  | 'detecting'
  | 'persisting'
  | 'complete';

export interface ScanProgress {
  phase: ScanPhase;
  message: string;
  percent: number;
  current?: number;
  total?: number;
  tokensFound?: number;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseDesignTokensReturn {
  data: DesignTokensData | null;
  tokens: DesignTokensResponse | null;
  isLoading: boolean;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  error: string | null;
  refetch: () => Promise<void>;
  /** Trigger a full re-scan of all project files (streaming SSE) */
  scan: () => Promise<void>;
  /** Cancel an in-progress scan */
  cancelScan: () => void;
}

/**
 * React hook to fetch design tokens for a project.
 * Reads from the persisted design_tokens DB table (populated on import).
 *
 * When rendered inside a `<DesignScanProvider>` (project-level layout),
 * the scan lifecycle is managed by the provider. This means navigating
 * away from the Design System page will NOT abort an in-progress scan.
 *
 * When rendered outside the provider (e.g. standalone), scan operations
 * fall back to a local AbortController that aborts on unmount.
 */
export function useDesignTokens(projectId: string): UseDesignTokensReturn {
  const [data, setData] = useState<DesignTokensData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Context-backed scan (survives navigation) ────────────────────────
  const ctx = useDesignScan();

  // Track the context's scanVersion to refetch persisted data after scan completes
  const prevVersionRef = useRef(ctx?.scanVersion ?? 0);

  // ── Fetch persisted tokens (GET) ─────────────────────────────────────

  const fetchTokens = useCallback(async () => {
    if (!projectId) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/design-tokens`,
        { signal: controller.signal },
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch design tokens (${res.status})`);
      }

      const json = await res.json();
      // The API wraps in { data: { tokens, tokenCount, analyzedFiles } }
      const payload: DesignTokensData = json.data ?? json;
      setData(payload);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [projectId]);

  // ── Scan methods ─────────────────────────────────────────────────────
  // Delegate to context if available; otherwise fall back to local no-op.

  const scan = useCallback(async () => {
    if (ctx) {
      await ctx.scan(projectId);
    }
  }, [ctx, projectId]);

  const cancelScan = useCallback(() => {
    ctx?.cancelScan();
  }, [ctx]);

  // ── Sync with context scan results ───────────────────────────────────
  // When the context reports a new scan result, use it optimistically
  // and trigger a refetch to ensure consistency.

  useEffect(() => {
    if (!ctx) return;

    if (ctx.scanVersion > prevVersionRef.current) {
      prevVersionRef.current = ctx.scanVersion;

      // Optimistically update from the last scan result
      if (ctx.lastScanResult) {
        setData(ctx.lastScanResult);
      }

      // Also refetch from DB to pick up any server-side normalization
      fetchTokens();
    }
  }, [ctx, ctx?.scanVersion, fetchTokens]);

  // ── Fetch on mount and when projectId changes ────────────────────────

  useEffect(() => {
    fetchTokens();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchTokens]);

  // ── Merge context scan state with local state ────────────────────────

  const isScanning = ctx?.isScanning ?? false;
  const scanProgress = ctx?.scanProgress ?? null;
  const combinedError = ctx?.scanError ?? error;

  return {
    data,
    tokens: data?.tokens ?? null,
    isLoading,
    isScanning,
    scanProgress,
    error: combinedError,
    refetch: fetchTokens,
    scan,
    cancelScan,
  };
}
