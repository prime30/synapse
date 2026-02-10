'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  fileCount: number;
  analyzedFiles: string[];
}

export interface UseDesignTokensReturn {
  data: DesignTokensData | null;
  tokens: DesignTokensResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * React hook to fetch design tokens for a project.
 * Provides SWR-like behavior with loading/error states and refetch.
 */
export function useDesignTokens(projectId: string): UseDesignTokensReturn {
  const [data, setData] = useState<DesignTokensData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      // The API wraps in { data: { tokens, fileCount, analyzedFiles } }
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

  // Fetch on mount and when projectId changes
  useEffect(() => {
    fetchTokens();
    return () => abortRef.current?.abort();
  }, [fetchTokens]);

  return {
    data,
    tokens: data?.tokens ?? null,
    isLoading,
    error,
    refetch: fetchTokens,
  };
}
