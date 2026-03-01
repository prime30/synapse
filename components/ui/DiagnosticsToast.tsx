'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * @deprecated Use the shared ToastProvider's `toast()` function instead.
 *
 * Example migration:
 * ```
 * const { toast } = useToast();
 * toast({
 *   message: 'Applied changes',
 *   type: 'success',
 *   action: { label: 'Undo', onClick: handleUndo },
 *   secondaryAction: { label: 'View issues', onClick: showIssues },
 * });
 * ```
 */
export interface DiagnosticsToastData {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  issueCount?: number;
  onUndo?: () => void;
  onViewIssues?: () => void;
}

interface DiagnosticsToastProps {
  toasts: DiagnosticsToastData[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS: Record<DiagnosticsToastData['type'], number> = {
  success: 5_000,
  error: 10_000,
  warning: 10_000,
};

const TOAST_STYLES: Record<
  DiagnosticsToastData['type'],
  { container: string; icon: string }
> = {
  success: {
    container: 'bg-accent/10 text-accent border-accent/20',
    icon: 'text-accent',
  },
  error: {
    container: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: 'text-red-400',
  },
  warning: {
    container: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: 'text-amber-400',
  },
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DismissIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const ICON_MAP: Record<
  DiagnosticsToastData['type'],
  React.FC<{ className?: string }>
> = {
  success: CheckIcon,
  error: XCircleIcon,
  warning: WarningIcon,
};

/* ── Single toast item ──────────────────────────────────────────────────── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: DiagnosticsToastData;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 250);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));

    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS[toast.type]);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, toast.type]);

  const styles = TOAST_STYLES[toast.type];
  const Icon = ICON_MAP[toast.type];

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'pointer-events-auto w-80 rounded-lg border px-4 py-3 shadow-lg',
        'transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]',
        styles.container,
        visible && !exiting
          ? 'translate-x-0 opacity-100'
          : 'translate-x-4 opacity-0',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{toast.message}</p>
          {toast.issueCount != null && toast.issueCount > 0 && (
            <p className="mt-0.5 text-xs opacity-80">
              {toast.issueCount} issue{toast.issueCount !== 1 ? 's' : ''} found
            </p>
          )}

          {(toast.onUndo || toast.onViewIssues) && (
            <div className="mt-2 flex items-center gap-2">
              {toast.onUndo && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onUndo?.();
                    dismiss();
                  }}
                  className="text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100 transition-opacity"
                >
                  Undo
                </button>
              )}
              {toast.onViewIssues && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onViewIssues?.();
                    dismiss();
                  }}
                  className="text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100 transition-opacity"
                >
                  View issues
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <DismissIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Toast stack container ──────────────────────────────────────────────── */

export function DiagnosticsToast({ toasts, onDismiss }: DiagnosticsToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
