'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BackgroundTaskBannerProps {
  executionId: string;
  projectId: string;
  iteration: number;
  /** Called when the background task completes and new content is available. */
  onComplete?: (result: { content: string; changes?: unknown[] }) => void;
  onDismiss?: () => void;
}

type PollStatus = 'polling' | 'completed' | 'failed' | 'dismissed';

export function BackgroundTaskBanner({
  executionId,
  projectId,
  iteration,
  onComplete,
  onDismiss,
}: BackgroundTaskBannerProps) {
  const [status, setStatus] = useState<PollStatus>('polling');
  const [elapsed, setElapsed] = useState(0);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const startRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    startRef.current = Date.now();

    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    let pollInterval = 3000;
    const maxInterval = 15000;

    const doPoll = async () => {
      try {
        const res = await fetch(
          `/api/agents/executions/${executionId}/status`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'completed') {
          setStatus('completed');
          setResultSummary('Agent completed in background.');
          onComplete?.({ content: 'Agent completed in background.', changes: [] });
          cleanup();
        } else if (data.status === 'failed') {
          setStatus('failed');
          setResultSummary(data.error || 'Background task failed.');
          cleanup();
        }
      } catch {
        // Transient network error; keep polling
      }
    };

    const scheduleNext = () => {
      pollRef.current = setTimeout(() => {
        doPoll().then(() => {
          if (status === 'polling') {
            pollInterval = Math.min(pollInterval * 1.5, maxInterval);
            scheduleNext();
          }
        });
      }, pollInterval) as unknown as ReturnType<typeof setInterval>;
    };

    scheduleNext();

    return cleanup;
  }, [executionId, projectId, cleanup, onComplete, status]);

  const handleDismiss = () => {
    setStatus('dismissed');
    cleanup();
    onDismiss?.();
  };

  if (status === 'dismissed') return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="mx-2 my-2 rounded-lg border border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-900/10 px-3 py-2">
      <div className="flex items-center gap-2">
        {status === 'polling' && (
          <>
            <div className="relative h-3 w-3">
              <div className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-50" />
              <div className="relative h-3 w-3 rounded-full bg-sky-500" />
            </div>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-200 flex-1">
              Continuing in background
              <span className="text-stone-500 dark:text-stone-400 ml-1">
                (iteration {iteration}, {timeStr})
              </span>
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}

        {status === 'completed' && (
          <>
            <svg className="h-3.5 w-3.5 text-[#28CD56]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-200 flex-1">
              Background task completed
              <span className="text-stone-500 dark:text-stone-400 ml-1">({timeStr})</span>
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <svg className="h-3.5 w-3.5 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-200 flex-1">
              Background task failed
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
      </div>

      {resultSummary && (
        <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
          {resultSummary}
        </p>
      )}
    </div>
  );
}
