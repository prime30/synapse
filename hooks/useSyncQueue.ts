'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WriteActor } from '@/lib/agents/tools/file-store';

export type SyncQueueStatus = 'idle' | 'syncing' | 'error' | 'coalescing';

export interface ConflictEvent {
  fileId: string;
  fileName: string;
  overwrittenBy: WriteActor;
  overwrittenActor: WriteActor;
  filePath: string;
  timestamp: number;
}

interface SyncQueueState {
  status: SyncQueueStatus;
  pendingCount: number;
  lastError: string | null;
  conflicts: ConflictEvent[];
}

const POLL_INTERVAL_MS = 2_000;
const CONFLICT_DISPLAY_TTL_MS = 30_000;

export function useSyncQueue(projectId: string | null) {
  const [state, setState] = useState<SyncQueueState>({
    status: 'idle',
    pendingCount: 0,
    lastError: null,
    conflicts: [],
  });

  const conflictsRef = useRef<ConflictEvent[]>([]);

  const addConflict = useCallback((conflict: Omit<ConflictEvent, 'timestamp'>) => {
    const event: ConflictEvent = { ...conflict, timestamp: Date.now() };
    conflictsRef.current = [...conflictsRef.current, event];
    setState(prev => ({ ...prev, conflicts: conflictsRef.current }));
  }, []);

  const dismissConflict = useCallback((index: number) => {
    conflictsRef.current = conflictsRef.current.filter((_, i) => i !== index);
    setState(prev => ({ ...prev, conflicts: conflictsRef.current }));
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const interval = setInterval(async () => {
      try {
        const { loadPendingWrites } = await import('@/lib/cache/pending-writes-store');
        const pending = await loadPendingWrites(projectId);
        const hasErrors = pending.some(w => w.attempts >= 3);

        setState(prev => ({
          ...prev,
          pendingCount: pending.length,
          status: pending.length === 0 ? 'idle' : hasErrors ? 'error' : 'syncing',
          lastError: hasErrors ? `${pending.filter(w => w.attempts >= 3).length} write(s) failing` : null,
        }));
      } catch {
        // Non-blocking
      }

      const now = Date.now();
      const fresh = conflictsRef.current.filter(c => now - c.timestamp < CONFLICT_DISPLAY_TTL_MS);
      if (fresh.length !== conflictsRef.current.length) {
        conflictsRef.current = fresh;
        setState(prev => ({ ...prev, conflicts: fresh }));
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [projectId]);

  return {
    ...state,
    addConflict,
    dismissConflict,
  };
}
