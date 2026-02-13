'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ScanPhase, ScanProgress, DesignTokensResponse, DesignTokensData } from '@/hooks/useDesignTokens';

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

interface DesignScanContextValue {
  /** Whether a scan is currently running */
  isScanning: boolean;
  /** Live scan progress (null when not scanning) */
  scanProgress: ScanProgress | null;
  /** Error from the last scan attempt */
  scanError: string | null;
  /** Trigger a full design-token scan for the given project */
  scan: (projectId: string) => Promise<void>;
  /** Cancel the in-progress scan */
  cancelScan: () => void;
  /**
   * Data returned from the last completed scan.
   * Consumers can use this to optimistically update their local state
   * without waiting for a refetch.
   */
  lastScanResult: DesignTokensData | null;
  /**
   * Monotonically-increasing counter. Increments every time a scan completes.
   * Components can listen to this to trigger a refetch of persisted data.
   */
  scanVersion: number;
}

const DesignScanContext = createContext<DesignScanContextValue | null>(null);

// ---------------------------------------------------------------------------
// SSE event types (duplicated from useDesignTokens to keep the context self-contained)
// ---------------------------------------------------------------------------

interface SSEProgressEvent {
  type: 'progress';
  phase: ScanPhase;
  message: string;
  percent: number;
  current?: number;
  total?: number;
  tokensFound?: number;
}

interface SSECompleteEvent {
  type: 'complete';
  data: {
    tokens: DesignTokensResponse;
    tokenCount: number;
    fileCount: number;
    tokensCreated: number;
    tokensUpdated: number;
    componentsDetected: number;
    totalFilesAnalyzed: number;
  };
}

interface SSEErrorEvent {
  type: 'error';
  message: string;
}

type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DesignScanProvider({ children }: { children: React.ReactNode }) {
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<DesignTokensData | null>(null);
  const [scanVersion, setScanVersion] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const cancelScan = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setScanProgress(null);
  }, []);

  const scan = useCallback(async (projectId: string) => {
    if (!projectId) return;

    // Abort any existing scan
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setScanProgress({ phase: 'loading', message: 'Starting scan...', percent: 0 });
    setScanError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/design-tokens/scan`,
        { method: 'POST', signal: controller.signal },
      );

      if (!res.ok) {
        throw new Error(`Scan failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE events (split on double newline)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const dataMatch = trimmed.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(dataMatch[1]) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case 'progress':
              setScanProgress({
                phase: event.phase,
                message: event.message,
                percent: event.percent,
                current: event.current,
                total: event.total,
                tokensFound: event.tokensFound,
              });
              break;

            case 'complete': {
              const result: DesignTokensData = {
                tokens: event.data.tokens,
                tokenCount: event.data.tokenCount,
                fileCount: event.data.fileCount,
                analyzedFiles: [],
              };
              setLastScanResult(result);
              setScanVersion((v) => v + 1);
              setScanProgress(null);
              break;
            }

            case 'error':
              setScanError(event.message);
              setScanProgress(null);
              break;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — clear progress without error
        setScanProgress(null);
        return;
      }
      setScanError(err instanceof Error ? err.message : 'Scan failed');
      setScanProgress(null);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  const value: DesignScanContextValue = {
    isScanning: scanProgress !== null,
    scanProgress,
    scanError,
    scan,
    cancelScan,
    lastScanResult,
    scanVersion,
  };

  return (
    <DesignScanContext.Provider value={value}>
      {children}
    </DesignScanContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Access the design scan context. Returns `null` when rendered outside
 * the provider (e.g. in the project list page), so callers can fall back
 * to local scan state.
 */
export function useDesignScan(): DesignScanContextValue | null {
  return useContext(DesignScanContext);
}
