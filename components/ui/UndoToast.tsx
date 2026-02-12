'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndoToastProps {
  /** e.g. "Applied changes to header.liquid" */
  message: string;
  /** Total duration in ms before auto-dismiss. @default 10000 */
  duration?: number;
  /** Called when the user clicks "Undo". */
  onUndo: () => void;
  /** Called when the toast is dismissed (timeout or manual close). */
  onDismiss: () => void;
  /** For batch operations, show a file count badge. */
  fileCount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_DURATION = 10_000;
/** How often we tick the progress bar (ms). */
const TICK_INTERVAL = 50;

export function UndoToast({
  message,
  duration = DEFAULT_DURATION,
  onUndo,
  onDismiss,
  fileCount,
}: UndoToastProps) {
  const [progress, setProgress] = useState(100); // percentage remaining
  const startRef = useRef(0);
  const dismissed = useRef(false);

  // Stable dismiss helper – prevents double-fire.
  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
  }, [onDismiss]);

  // Countdown tick + auto-dismiss
  useEffect(() => {
    startRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        dismiss();
      }
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [duration, dismiss]);

  const handleUndo = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    onUndo();
  };

  const secondsLeft = Math.ceil((progress / 100) * (duration / 1000));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
    >
      {/* Content area */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        {/* Icon */}
        <div className="mt-0.5 flex-shrink-0 text-blue-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0zm-7-4a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate">{message}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {fileCount && fileCount > 1
              ? `${fileCount} files · `
              : ''}
            {secondsLeft}s to undo
          </p>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 rounded p-0.5 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-600"
          aria-label="Dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Undo button row */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={handleUndo}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          Undo
        </button>
      </div>

      {/* Animated countdown progress bar */}
      <div className="h-1 w-full bg-gray-800">
        <div
          className="h-full bg-blue-500 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
