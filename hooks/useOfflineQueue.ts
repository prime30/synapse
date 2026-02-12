'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'synapse-offline-queue';
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30000;

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string;
  timestamp: number;
  retryCount: number;
}

export interface OfflineQueueState {
  isOnline: boolean;
  queueLength: number;
  isFlushing: boolean;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function useOfflineQueue(): {
  state: OfflineQueueState;
  enqueue: (url: string, method: string, body: string) => void;
  flush: () => Promise<void>;
  clear: () => void;
  getQueue: () => QueuedRequest[];
} {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queue, setQueue] = useState<QueuedRequest[]>(() => loadQueue());
  const [isFlushing, setIsFlushing] = useState(false);

  const persistQueue = useCallback((next: QueuedRequest[]) => {
    setQueue(next);
    saveQueue(next);
  }, []);

  const enqueue = useCallback(
    (url: string, method: string, body: string) => {
      const request: QueuedRequest = {
        id: generateId(),
        url,
        method,
        body,
        timestamp: Date.now(),
        retryCount: 0,
      };
      persistQueue([...loadQueue(), request]);
    },
    [persistQueue]
  );

  const flush = useCallback(async () => {
    const current = loadQueue();
    if (current.length === 0 || !navigator.onLine) return;

    setIsFlushing(true);
    let queueCopy = [...current];

    for (let i = 0; i < queueCopy.length; i++) {
      const req = queueCopy[i];
      if (req.retryCount > MAX_RETRIES) {
        queueCopy = queueCopy.filter((r) => r.id !== req.id);
        persistQueue(queueCopy);
        continue;
      }

      const backoffMs = Math.min(
        1000 * Math.pow(2, req.retryCount),
        MAX_BACKOFF_MS
      );
      if (req.retryCount > 0) {
        await new Promise((r) => setTimeout(r, backoffMs));
      }

      try {
        const res = await fetch(req.url, {
          method: req.method,
          body: req.body,
          headers: { 'Content-Type': 'application/json' },
        });

        if (res.ok) {
          queueCopy = queueCopy.filter((r) => r.id !== req.id);
          persistQueue(queueCopy);
        } else {
          const updated = queueCopy.map((r) =>
            r.id === req.id ? { ...r, retryCount: r.retryCount + 1 } : r
          );
          queueCopy = updated;
          persistQueue(queueCopy);
        }
      } catch {
        const updated = queueCopy.map((r) =>
          r.id === req.id ? { ...r, retryCount: r.retryCount + 1 } : r
        );
        queueCopy = updated;
        persistQueue(queueCopy);
      }
    }

    setIsFlushing(false);
  }, [persistQueue]);

  const clear = useCallback(() => {
    persistQueue([]);
  }, [persistQueue]);

  const getQueue = useCallback(() => loadQueue(), []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flush();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flush]);

  const state: OfflineQueueState = {
    isOnline,
    queueLength: queue.length,
    isFlushing,
  };

  return {
    state,
    enqueue,
    flush,
    clear,
    getQueue,
  };
}
