'use client';

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingChange {
  id: string;
  fileId: string;
  fileName: string;
  newContent: string;
  originalContent: string;
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface BatchChangeItem {
  fileId: string;
  fileName: string;
  newContent: string;
  originalContent: string;
}

export interface BatchOperation {
  batchId: string;
  changes: PendingChange[];
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const UNDO_WINDOW_MS = 10_000;

interface UseApplyWithUndoOptions {
  /** Called when the undo window elapses – perform the actual file save here. */
  onWrite: (fileId: string, content: string) => Promise<void>;
  /** Override the default 10 s undo window (mainly useful for tests). */
  undoWindowMs?: number;
}

export function useApplyWithUndo({
  onWrite,
  undoWindowMs = UNDO_WINDOW_MS,
}: UseApplyWithUndoOptions) {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [batchOperations, setBatchOperations] = useState<BatchOperation[]>([]);

  // Keep a ref-mirror of pending changes so timeout closures always see the
  // latest list without re-creating callbacks on every state change.
  const pendingRef = useRef<PendingChange[]>([]);
  const batchRef = useRef<BatchOperation[]>([]);

  // Helpers to keep ref + state in sync
  const setPending = useCallback((updater: (prev: PendingChange[]) => PendingChange[]) => {
    setPendingChanges((prev) => {
      const next = updater(prev);
      pendingRef.current = next;
      return next;
    });
  }, []);

  const setBatch = useCallback((updater: (prev: BatchOperation[]) => BatchOperation[]) => {
    setBatchOperations((prev) => {
      const next = updater(prev);
      batchRef.current = next;
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // Single-file apply
  // ------------------------------------------------------------------

  const applyChange = useCallback(
    (
      fileId: string,
      fileName: string,
      newContent: string,
      originalContent: string,
    ): string => {
      const id = crypto.randomUUID();
      const createdAt = Date.now();

      const timeoutId = setTimeout(async () => {
        // When timer fires, commit the write and remove from pending list.
        try {
          await onWrite(fileId, newContent);
        } finally {
          setPending((prev) => prev.filter((c) => c.id !== id));
        }
      }, undoWindowMs);

      const change: PendingChange = {
        id,
        fileId,
        fileName,
        newContent,
        originalContent,
        createdAt,
        timeoutId,
      };

      setPending((prev) => [...prev, change]);

      return id;
    },
    [onWrite, undoWindowMs, setPending],
  );

  // ------------------------------------------------------------------
  // Undo a single pending change
  // ------------------------------------------------------------------

  const undoChange = useCallback(
    (pendingId: string): void => {
      setPending((prev) => {
        const target = prev.find((c) => c.id === pendingId);
        if (target) {
          clearTimeout(target.timeoutId);
        }
        return prev.filter((c) => c.id !== pendingId);
      });
    },
    [setPending],
  );

  // ------------------------------------------------------------------
  // Batch apply
  // ------------------------------------------------------------------

  const applyBatch = useCallback(
    (changes: BatchChangeItem[]): string => {
      const batchId = crypto.randomUUID();
      const createdAt = Date.now();

      // Create PendingChange entries for every item in the batch.
      const pendingItems: PendingChange[] = changes.map((item) => ({
        id: crypto.randomUUID(),
        fileId: item.fileId,
        fileName: item.fileName,
        newContent: item.newContent,
        originalContent: item.originalContent,
        createdAt,
        // The batch-level timeout handles the commit – individual items don't
        // need their own timer, but the type requires a value.
        timeoutId: undefined as unknown as ReturnType<typeof setTimeout>,
      }));

      const timeoutId = setTimeout(async () => {
        try {
          // Write all files in the batch.
          await Promise.all(
            pendingItems.map((item) => onWrite(item.fileId, item.newContent)),
          );
        } finally {
          const itemIds = new Set(pendingItems.map((i) => i.id));
          setPending((prev) => prev.filter((c) => !itemIds.has(c.id)));
          setBatch((prev) => prev.filter((b) => b.batchId !== batchId));
        }
      }, undoWindowMs);

      // Assign the shared timeout to each item (for bookkeeping).
      for (const item of pendingItems) {
        item.timeoutId = timeoutId;
      }

      const operation: BatchOperation = {
        batchId,
        changes: pendingItems,
        createdAt,
        timeoutId,
      };

      setPending((prev) => [...prev, ...pendingItems]);
      setBatch((prev) => [...prev, operation]);

      return batchId;
    },
    [onWrite, undoWindowMs, setPending, setBatch],
  );

  // ------------------------------------------------------------------
  // Undo an entire batch
  // ------------------------------------------------------------------

  const undoBatch = useCallback(
    (batchId: string): void => {
      setBatch((prev) => {
        const target = prev.find((b) => b.batchId === batchId);
        if (target) {
          clearTimeout(target.timeoutId);
          const itemIds = new Set(target.changes.map((c) => c.id));
          setPending((p) => p.filter((c) => !itemIds.has(c.id)));
        }
        return prev.filter((b) => b.batchId !== batchId);
      });
    },
    [setPending, setBatch],
  );

  return {
    applyChange,
    undoChange,
    applyBatch,
    undoBatch,
    pendingChanges,
    batchOperations,
  } as const;
}
