'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type FileCategory = 'component' | 'page' | 'layout' | 'asset' | 'config';

export interface DevReportFile {
  path: string;
  status: 'added' | 'modified';
  category: FileCategory;
  linesAdded: number;
  linesRemoved: number;
}

export interface DevReport {
  summary: {
    totalFiles: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
    componentsAffected: number;
    pagesWorked: number;
  };
  lastPushAt: string | null;
  files: DevReportFile[];
}

/* ------------------------------------------------------------------ */
/*  Fetcher                                                            */
/* ------------------------------------------------------------------ */

async function fetchDevReport(projectId: string): Promise<DevReport> {
  const res = await fetch(`/api/projects/${projectId}/dev-report`);
  if (!res.ok) throw new Error('Failed to fetch dev report');
  const json = await res.json();
  return json.data;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Lazy-then-live dev report hook.
 * - Stays disabled until the first explicit `refresh()` call (e.g. button click
 *   or first file save).
 * - Once activated it auto-refetches whenever the query is invalidated or the
 *   `refetchInterval` fires.
 */
export function useDevReport(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const [activated, setActivated] = useState(false);

  const query = useQuery<DevReport>({
    queryKey: ['dev-report', projectId],
    queryFn: () => fetchDevReport(projectId!),
    enabled: activated && !!projectId,
    staleTime: 30_000,
  });

  /** Activate the query (idempotent) and fetch fresh data. */
  const refresh = useCallback(() => {
    if (projectId) {
      setActivated(true);
      query.refetch();
    }
  }, [projectId, query]);

  /** Invalidate cached data — triggers an automatic refetch if activated. */
  const invalidate = useCallback(() => {
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: ['dev-report', projectId] });
    }
  }, [projectId, queryClient]);

  /** Reset to empty state (used after push clears pending files). */
  const reset = useCallback(() => {
    if (projectId) {
      queryClient.setQueryData<DevReport>(['dev-report', projectId], {
        summary: {
          totalFiles: 0,
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
          componentsAffected: 0,
          pagesWorked: 0,
        },
        lastPushAt: new Date().toISOString(),
        files: [],
      });
    }
  }, [projectId, queryClient]);

  return {
    data: query.data ?? null,
    isLoading: query.isFetching,
    error: query.error,
    activated,
    refresh,
    invalidate,
    reset,
  };
}
