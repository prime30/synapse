'use client';

import { useState, useCallback, useEffect } from 'react';
import type { FileGroup } from '@/lib/shopify/theme-grouping';

const STORAGE_KEY_PREFIX = 'synapse-file-tabs-';
const GROUPS_KEY_PREFIX = 'synapse-tab-groups-';

interface UseFileTabsOptions {
  projectId: string;
}

export function useFileTabs({ projectId }: UseFileTabsOptions) {
  const storageKey = `${STORAGE_KEY_PREFIX}${projectId}`;
  const groupsKey = `${GROUPS_KEY_PREFIX}${projectId}`;

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

  // ── Workset / group state ───────────────────────────────────────────────
  const [tabGroups, setTabGroups] = useState<FileGroup[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(groupsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

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

  // ── Persist groups ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(groupsKey, JSON.stringify(tabGroups));
    } catch {
      // Ignore storage errors
    }
  }, [tabGroups, groupsKey]);

  // ── Group actions ─────────────────────────────────────────────────────────
  const setGroups = useCallback((groups: FileGroup[]) => {
    setTabGroups(groups);
    if (groups.length > 0) {
      setActiveGroupId(groups[0].id);
    }
  }, []);

  const openGroup = useCallback(
    (groupId: string) => {
      const group = tabGroups.find((g) => g.id === groupId);
      if (!group) return;
      setActiveGroupId(groupId);

      // Open all tabs in the group
      setOpenTabs((prev) => {
        const next = [...prev];
        for (const fileId of group.fileIds) {
          if (!next.includes(fileId)) next.push(fileId);
        }
        return next;
      });

      // Activate the root file
      setActiveFileId(group.rootFileId);
    },
    [tabGroups]
  );

  const closeGroup = useCallback(
    (groupId: string) => {
      const group = tabGroups.find((g) => g.id === groupId);
      if (!group) return;

      // Close all tabs in the group that aren't in another active group
      const otherGroupFileIds = new Set(
        tabGroups
          .filter((g) => g.id !== groupId)
          .flatMap((g) => g.fileIds)
      );

      setOpenTabs((prev) =>
        prev.filter(
          (id) => !group.fileIds.includes(id) || otherGroupFileIds.has(id)
        )
      );

      if (activeGroupId === groupId) {
        const remaining = tabGroups.filter((g) => g.id !== groupId);
        setActiveGroupId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [tabGroups, activeGroupId]
  );

  const switchGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
  }, []);

  const clearGroups = useCallback(() => {
    setTabGroups([]);
    setActiveGroupId(null);
  }, []);

  // Compute which tabs belong to the active group
  const activeGroup = tabGroups.find((g) => g.id === activeGroupId) ?? null;

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

    // Group / workset support
    tabGroups,
    activeGroupId,
    activeGroup,
    setGroups,
    openGroup,
    closeGroup,
    switchGroup,
    clearGroups,
  };
}
