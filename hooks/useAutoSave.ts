'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { consoleStream } from '@/lib/editor/console-stream';

const STORAGE_PREFIX = 'synapse-draft-';
const INTERVAL_MS = 30000;
const OFFLINE_QUEUE_KEY = 'synapse-autosave-offline-queue';

/* ── Types ────────────────────────────────────────────────────────────── */

interface QueuedSave {
  fileId: string;
  content: string;
  timestamp: number;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function useAutoSave(
  fileId: string | null,
  content: string,
  isDirty: boolean,
  /** Optional callback to persist to server. If provided, auto-save calls it. */
  onSave?: (fileId: string, content: string) => Promise<void>,
) {
  const contentRef = useRef(content);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [hasOfflineChanges, setHasOfflineChanges] = useState(false);

  /* Track online/offline state */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      consoleStream.emit('push-log', 'success', 'Connection restored');
      // Flush offline queue
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      consoleStream.emit('push-log', 'warning', 'Connection lost — changes saved locally');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Check for offline changes on mount */
  useEffect(() => {
    const queue = loadOfflineQueue();
    setHasOfflineChanges(queue.length > 0);
  }, []);

  const saveToStorage = useCallback(() => {
    if (!fileId || !isDirty) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${fileId}`, contentRef.current);
    } catch {
      // Ignore storage errors
    }
  }, [fileId, isDirty]);

  /** Queue a save for offline retry */
  const queueOfflineSave = useCallback((fId: string, c: string) => {
    try {
      const queue = loadOfflineQueue();
      // Replace existing entry for the same file
      const filtered = queue.filter((q) => q.fileId !== fId);
      filtered.push({ fileId: fId, content: c, timestamp: Date.now() });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
      setHasOfflineChanges(true);
    } catch {
      // Storage full or unavailable
    }
  }, []);

  /** Attempt to save, queue on failure */
  const attemptSave = useCallback(
    async (fId: string, c: string) => {
      if (!onSave) {
        // No server save callback — just save to local storage
        saveToStorage();
        return;
      }

      if (!navigator.onLine) {
        queueOfflineSave(fId, c);
        consoleStream.emit('push-log', 'info', `Queued save for "${fId}" (offline)`);
        return;
      }

      try {
        await onSave(fId, c);
        consoleStream.emit('push-log', 'success', `Auto-saved "${fId}"`);
      } catch {
        queueOfflineSave(fId, c);
        consoleStream.emit(
          'push-log',
          'warning',
          `Failed to save "${fId}" — queued for retry`,
        );
      }
    },
    [onSave, saveToStorage, queueOfflineSave],
  );

  /** Flush offline queue on reconnect */
  const flushOfflineQueue = useCallback(async () => {
    if (!onSave) return;
    const queue = loadOfflineQueue();
    if (queue.length === 0) return;

    consoleStream.emit(
      'push-log',
      'info',
      `Flushing ${queue.length} queued save(s)...`,
    );

    const remaining: QueuedSave[] = [];

    for (const item of queue) {
      try {
        await onSave(item.fileId, item.content);
        consoleStream.emit('push-log', 'success', `Flushed save for "${item.fileId}"`);
      } catch {
        remaining.push(item);
        consoleStream.emit(
          'push-log',
          'error',
          `Failed to flush save for "${item.fileId}"`,
        );
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    setHasOfflineChanges(remaining.length > 0);
  }, [onSave]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  /* Periodic auto-save */
  useEffect(() => {
    if (!fileId || !isDirty) return;

    const id = setInterval(() => {
      void attemptSave(fileId, contentRef.current);
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [fileId, isDirty, attemptSave]);

  const loadDraft = useCallback((fId: string | null): string | null => {
    if (!fId) return null;
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${fId}`);
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback((fId: string | null) => {
    if (!fId) return;
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${fId}`);
    } catch {
      // Ignore
    }
  }, []);

  return {
    loadDraft,
    clearDraft,
    isOnline,
    hasOfflineChanges,
    flushOfflineQueue,
  };
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function loadOfflineQueue(): QueuedSave[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedSave[];
  } catch {
    return [];
  }
}
