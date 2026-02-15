'use client';

import React, { useState } from 'react';
import type { BatchJobStatus } from '@/hooks/useBatchJobs';

interface BatchJobIndicatorProps {
  jobs: BatchJobStatus[];
  onCancel?: (batchId: string) => void;
}

export function BatchJobIndicator({ jobs, onCancel }: BatchJobIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const activeJobs = jobs.filter(
    j => j.status === 'in_progress' || j.status === 'canceling',
  );
  const completedJobs = jobs.filter(j => j.status === 'ended');
  const erroredJobs = jobs.filter(j => j.status === 'error');

  if (jobs.length === 0) return null;

  const totalActive = activeJobs.length;
  const totalProcessed = activeJobs.reduce(
    (sum, j) => sum + (j.requestCounts?.succeeded ?? 0),
    0,
  );
  const totalRequests = activeJobs.reduce(
    (sum, j) =>
      sum +
      (j.requestCounts
        ? j.requestCounts.processing +
          j.requestCounts.succeeded +
          j.requestCounts.errored +
          j.requestCounts.canceled +
          j.requestCounts.expired
        : 0),
    0,
  );

  return (
    <div
      className="relative"
      role="region"
      aria-label="Batch processing status"
    >
      {/* Compact indicator */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 text-[11px] ide-text-2 ide-hover rounded transition-colors"
        aria-expanded={expanded}
        aria-label={
          totalActive > 0
            ? `${totalActive} batch job${totalActive !== 1 ? 's' : ''} processing`
            : `${completedJobs.length} batch job${completedJobs.length !== 1 ? 's' : ''} completed`
        }
      >
        {totalActive > 0 ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span>
              Batch: {totalProcessed}/{totalRequests}
            </span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>
              {completedJobs.length} batch{completedJobs.length !== 1 ? 'es' : ''} done
            </span>
          </>
        )}
        {erroredJobs.length > 0 && (
          <span className="text-red-400 ml-1">
            ({erroredJobs.length} failed)
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="absolute bottom-full right-0 mb-1 w-72 rounded-lg border ide-border ide-surface-inset shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b ide-border">
            <span className="text-[11px] font-medium ide-text-1">
              Batch Jobs
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {jobs.map(job => (
              <div
                key={job.batchId}
                className="px-3 py-2 border-b last:border-0 ide-border text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono ide-text-2 truncate max-w-[140px]">
                    {job.batchId.slice(0, 16)}…
                  </span>
                  <StatusBadge status={job.status} />
                </div>
                {job.requestCounts && (
                  <div className="mt-1 flex gap-2 ide-text-muted">
                    <span>✓ {job.requestCounts.succeeded}</span>
                    {job.requestCounts.errored > 0 && (
                      <span className="text-red-400">
                        ✗ {job.requestCounts.errored}
                      </span>
                    )}
                    <span>⏳ {job.requestCounts.processing}</span>
                  </div>
                )}
                {job.error && (
                  <p className="mt-1 text-red-400 text-[10px]">{job.error}</p>
                )}
                {job.status === 'in_progress' && onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(job.batchId)}
                    className="mt-1 text-[10px] text-red-400 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BatchJobStatus['status'] }) {
  const classes: Record<string, string> = {
    in_progress: 'text-amber-400',
    ended: 'text-emerald-400',
    canceling: 'text-orange-400',
    error: 'text-red-400',
  };

  const labels: Record<string, string> = {
    in_progress: 'Processing',
    ended: 'Complete',
    canceling: 'Canceling',
    error: 'Failed',
  };

  return (
    <span className={`${classes[status] ?? 'ide-text-muted'} font-medium`}>
      {labels[status] ?? status}
    </span>
  );
}
