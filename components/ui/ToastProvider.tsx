'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Toast } from './Toast';
import type { ToastData } from './Toast';
import {
  addPinnedToast,
  getPinnedToasts,
  removePinnedToast,
} from '@/lib/storage/pinned-toasts';

const MAX_VISIBLE = 5;
const MAX_PINNED = 3;

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  pinned?: boolean;
  countdown?: number;
}

export interface ToastContextValue {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  togglePin: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idPrefix = useId();

  useEffect(() => {
    const pinned = getPinnedToasts();
    if (pinned.length === 0) return;
    const restored: ToastData[] = pinned.map((p) => ({
      id: p.id,
      message: p.message,
      type: p.type,
      pinned: true,
    }));
    setToasts((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const newPinned = restored.filter((r) => !existingIds.has(r.id));
      if (newPinned.length === 0) return prev;
      return [...newPinned, ...prev].slice(0, MAX_VISIBLE);
    });
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = `${idPrefix}-${Math.random().toString(36).slice(2, 11)}`;
    const data: ToastData = {
      id,
      message: opts.message,
      type: opts.type ?? 'info',
      duration: opts.duration,
      action: opts.action,
      secondaryAction: opts.secondaryAction,
      pinned: opts.pinned ?? false,
      countdown: opts.countdown,
    };
    setToasts((prev) => {
      const next = [...prev, data];
      if (next.length > MAX_VISIBLE) {
        return next.slice(-MAX_VISIBLE);
      }
      return next;
    });
    return id;
  }, [idPrefix]);

  const dismiss = useCallback((id: string) => {
    removePinnedToast(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setToasts((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t) return prev;
      const willBePinned = !t.pinned;
      if (willBePinned) {
        const stored = getPinnedToasts();
        let next = prev.map((x) =>
          x.id === id ? { ...x, pinned: true } : x
        );
        if (stored.length >= MAX_PINNED) {
          const oldest = stored[stored.length - 1];
          if (oldest && oldest.id !== id) {
            next = next.map((x) =>
              x.id === oldest.id ? { ...x, pinned: false } : x
            );
            removePinnedToast(oldest.id);
          }
        }
        addPinnedToast({
          id: t.id,
          message: t.message,
          type: (t.type ?? 'info') as 'success' | 'error' | 'warning' | 'info',
          pinnedAt: Date.now(),
        });
        return next.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return 0;
        });
      } else {
        removePinnedToast(id);
        return prev.map((x) =>
          x.id === id ? { ...x, pinned: false } : x
        );
      }
    });
  }, []);

  const sortedToasts = useMemo(() => {
    return [...toasts].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
  }, [toasts]);

  const value = useMemo(
    () => ({ toast, dismiss, togglePin }),
    [toast, dismiss, togglePin]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none"
        aria-label="Notifications"
      >
        <div className="flex flex-col gap-2 pointer-events-auto">
          {sortedToasts.map((t) => (
            <Toast
              key={t.id}
              toast={t}
              onDismiss={dismiss}
              onTogglePin={togglePin}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
