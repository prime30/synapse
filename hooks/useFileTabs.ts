'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'synapse-file-tabs-';

interface UseFileTabsOptions {
  projectId: string;
}

export function useFileTabs({ projectId }: UseFileTabsOptions) {
  const storageKey = `${STORAGE_KEY_PREFIX}${projectId}`;

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [unsavedFileIds, setUnsavedFileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(openTabs));
    } catch {
      // Ignore storage errors
    }
  }, [openTabs, storageKey]);

  const openTab = useCallback(
    (fileId: string) => {
      setOpenTabs((prev) =>
        prev.includes(fileId) ? prev : [...prev, fileId]
      );
      setActiveFileId(fileId);
    },
    []
  );

  const closeTab = useCallback((fileId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((id) => id !== fileId);
      setActiveFileId((current) => {
        if (current !== fileId) return current;
        const idx = prev.indexOf(fileId);
        if (idx > 0) return prev[idx - 1];
        if (idx < prev.length - 1) return prev[idx + 1];
        return next[0] ?? null;
      });
      return next;
    });
  }, []);

  const switchTab = useCallback((fileId: string) => {
    setActiveFileId(fileId);
  }, []);

  const nextTab = useCallback(() => {
    setOpenTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.indexOf(activeFileId ?? '');
      const nextIdx = idx < 0 ? 0 : (idx + 1) % prev.length;
      setActiveFileId(prev[nextIdx]);
      return prev;
    });
  }, [activeFileId]);

  const prevTab = useCallback(() => {
    setOpenTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.indexOf(activeFileId ?? '');
      const nextIdx =
        idx <= 0 ? prev.length - 1 : (idx - 1 + prev.length) % prev.length;
      setActiveFileId(prev[nextIdx]);
      return prev;
    });
  }, [activeFileId]);

  const markUnsaved = useCallback((fileId: string, unsaved: boolean) => {
    setUnsavedFileIds((prev) => {
      const next = new Set(prev);
      if (unsaved) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }, []);

  return {
    openTabs,
    activeFileId,
    unsavedFileIds,
    openTab,
    closeTab,
    switchTab,
    nextTab,
    prevTab,
    markUnsaved,
  };
}
