'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────

export interface BatchJobStatus {
  batchId: string;
  status: 'in_progress' | 'ended' | 'canceling' | 'error';
  requestCounts?: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  createdAt?: string;
  endedAt?: string;
  results?: Array<{
    custom_id: string;
    result: {
      type: 'succeeded' | 'errored' | 'expired' | 'canceled';
      message?: { content: Array<{ type: string; text?: string }> };
      error?: { type: string; message: string };
    };
  }>;
  error?: string;
}

interface UseBatchJobsReturn {
  /** Currently tracked batch jobs. */
  jobs: BatchJobStatus[];
  /** Submit a batch and start polling for completion. */
  submitBatch: (projectId: string, requests: unknown[]) => Promise<string | null>;
  /** Cancel a running batch. */
  cancelBatch: (projectId: string, batchId: string) => Promise<void>;
  /** Whether any job is in progress. */
  hasActiveJobs: boolean;
  /** Progress summary across all active jobs. */
  activeSummary: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000; // 5 seconds

// ── Hook ──────────────────────────────────────────────────────────────

export function useBatchJobs(): UseBatchJobsReturn {
  const [jobs, setJobs] = useState<BatchJobStatus[]>([]);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Clear timers on unmount
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      for (const timer of timers.values()) {
        clearInterval(timer);
      }
    };
  }, []);

  const updateJob = useCallback((batchId: string, updates: Partial<BatchJobStatus>) => {
    setJobs(prev =>
      prev.map(j => (j.batchId === batchId ? { ...j, ...updates } : j)),
    );
  }, []);

  const stopPolling = useCallback((batchId: string) => {
    const timer = pollTimers.current.get(batchId);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(batchId);
    }
  }, []);

  const pollJob = useCallback(
    async (projectId: string, batchId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/batch?batchId=${batchId}`,
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error((errBody as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as BatchJobStatus;
        updateJob(batchId, data);

        // Stop polling when done
        if (data.status === 'ended' || data.status === 'error') {
          stopPolling(batchId);
        }
      } catch (err) {
        updateJob(batchId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Poll failed',
        });
        stopPolling(batchId);
      }
    },
    [updateJob, stopPolling],
  );

  const submitBatch = useCallback(
    async (projectId: string, requests: unknown[]): Promise<string | null> => {
      try {
        const res = await fetch(`/api/projects/${projectId}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error((errBody as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as { batchId: string; status: string; requestCounts: BatchJobStatus['requestCounts'] };
        const newJob: BatchJobStatus = {
          batchId: data.batchId,
          status: data.status as BatchJobStatus['status'],
          requestCounts: data.requestCounts,
        };

        setJobs(prev => [...prev, newJob]);

        // Start polling
        const timer = setInterval(() => {
          pollJob(projectId, data.batchId);
        }, POLL_INTERVAL_MS);
        pollTimers.current.set(data.batchId, timer);

        return data.batchId;
      } catch (err) {
        console.error('[useBatchJobs] submit error:', err);
        return null;
      }
    },
    [pollJob],
  );

  const cancelBatchFn = useCallback(
    async (projectId: string, batchId: string) => {
      try {
        stopPolling(batchId);
        const res = await fetch(
          `/api/projects/${projectId}/batch?batchId=${batchId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error(`Cancel failed: HTTP ${res.status}`);
        updateJob(batchId, { status: 'canceling' });
      } catch (err) {
        console.error('[useBatchJobs] cancel error:', err);
        updateJob(batchId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Cancel failed',
        });
      }
    },
    [updateJob, stopPolling],
  );

  const hasActiveJobs = jobs.some(
    j => j.status === 'in_progress' || j.status === 'canceling',
  );

  const activeSummary = (() => {
    const active = jobs.filter(j => j.status === 'in_progress');
    if (active.length === 0) return '';
    const total = active.reduce(
      (sum, j) =>
        sum +
        (j.requestCounts
          ? j.requestCounts.processing +
            j.requestCounts.succeeded +
            j.requestCounts.errored
          : 0),
      0,
    );
    const done = active.reduce(
      (sum, j) => sum + (j.requestCounts?.succeeded ?? 0),
      0,
    );
    return `${active.length} batch${active.length > 1 ? 'es' : ''}: ${done}/${total} done`;
  })();

  return {
    jobs,
    submitBatch,
    cancelBatch: cancelBatchFn,
    hasActiveJobs,
    activeSummary,
  };
}
