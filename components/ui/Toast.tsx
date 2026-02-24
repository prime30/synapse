'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Pin,
  X,
} from 'lucide-react';

export interface ToastData {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: { label: string; onClick: () => void };
  pinned?: boolean;
}

const DEFAULT_DURATION: Record<NonNullable<ToastData['type']>, number> = {
  success: 5_000,
  error: 10_000,
  warning: 10_000,
  info: 5_000,
};

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const ICON_CLASSES = {
  success: 'text-green-500 dark:text-green-400',
  error: 'text-red-500 dark:text-red-400',
  warning: 'text-amber-500 dark:text-amber-400',
  info: 'text-sky-500 dark:text-sky-400',
} as const;

export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
  onTogglePin?: (id: string) => void;
}

export function Toast({ toast, onDismiss, onTogglePin }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissAtRef = useRef<number>(0);

  const type = toast.type ?? 'info';
  const duration = toast.duration ?? DEFAULT_DURATION[type];
  const Icon = ICON_MAP[type];
  const iconClass = ICON_CLASSES[type];

  const dismiss = useCallback(() => {
    setIsExiting(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const exitDelay = 200;
    const t = setTimeout(() => onDismiss(toast.id), exitDelay);
    return () => clearTimeout(t);
  }, [onDismiss, toast.id]);

  const scheduleDismiss = useCallback(
    (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      dismissAtRef.current = Date.now() + delay;
      timerRef.current = setTimeout(dismiss, delay);
    },
    [dismiss]
  );

  useEffect(() => {
    if (toast.pinned) return;
    scheduleDismiss(duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, scheduleDismiss, toast.pinned]);

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (toast.pinned) return;
    const remaining = Math.max(0, dismissAtRef.current - Date.now());
    if (remaining > 0) {
      scheduleDismiss(remaining);
    }
  }, [scheduleDismiss, toast.pinned]);

  const handleActionClick = useCallback(() => {
    toast.action?.onClick();
    dismiss();
  }, [toast.action, dismiss]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="flex w-80 flex-shrink-0 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-lg dark:border-white/10 dark:bg-[oklch(0.21_0_0)]"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-start gap-3">
            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-stone-900 dark:text-white">
                {toast.message}
              </p>
              {toast.action && (
                <button
                  type="button"
                  onClick={handleActionClick}
                  className="mt-1.5 text-sm font-medium text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {onTogglePin && (
                <button
                  type="button"
                  onClick={() => onTogglePin(toast.id)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Pin notification"
                  aria-pressed={toast.pinned}
                >
                  <Pin
                    className={`h-4 w-4 ${
                      toast.pinned
                        ? 'text-sky-500 dark:text-sky-400 fill-current'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="rounded p-0.5 text-stone-400 transition-colors hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
