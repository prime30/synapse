'use client';

import { useState, useCallback } from 'react';
import type { DriftResult } from '@/lib/design-tokens/drift/types';

export interface UseDriftBatchReturn {
  results: DriftResult[];
  isAnalyzing: boolean;
  error: string | null;
  analyze: (filePaths?: string[]) => Promise<void>;
  clear: () => void;
}

export function useDriftBatch(projectId: string): UseDriftBatchReturn {
  const [results, setResults] = useState<DriftResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (filePaths?: string[]) => {
    if (!projectId) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {};
      if (filePaths && filePaths.length > 0) body.filePaths = filePaths;

      const res = await fetch(`/api/projects/${projectId}/design-tokens/drift/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Batch drift failed (${res.status})`);
      const json = await res.json();
      setResults(json.data?.results ?? json.results ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [projectId]);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, isAnalyzing, error, analyze, clear };
}
