'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { LocalSyncStatus } from './useLocalSync';

export interface LoadingItem {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  critical: boolean;
  /** 0-100 for items with granular progress. */
  progress?: number;
  /** Detail text, e.g. "Batch 3/10". */
  detail?: string;
}

export interface ProjectLoadingState {
  items: LoadingItem[];
  criticalDone: boolean;
  allDone: boolean;
}

export interface LoadingStateInputs {
  isLoadingProjects: boolean;
  isLoadingFiles: boolean;
  storeStatusReady: boolean;
  designTokensLoading: boolean;
  previewReady: boolean;
  monacoReady: boolean;
  localSyncStatus: LocalSyncStatus;
}

type RawStatus = 'pending' | 'active' | 'done' | 'error';

const MIN_DISPLAY_MS = 500;

const ITEM_DEFS: { id: string; label: string; critical: boolean }[] = [
  { id: 'projects', label: 'Project data', critical: true },
  { id: 'files', label: 'Theme files', critical: true },
  { id: 'store', label: 'Shopify connection', critical: true },
  { id: 'designTokens', label: 'Design tokens', critical: false },
  { id: 'preview', label: 'Preview', critical: false },
  { id: 'monaco', label: 'Editor', critical: false },
  { id: 'localSync', label: 'Local sync', critical: false },
];

function computeRawStatuses(inputs: LoadingStateInputs): Record<string, RawStatus> {
  const {
    isLoadingProjects, isLoadingFiles, storeStatusReady,
    designTokensLoading, previewReady, monacoReady, localSyncStatus,
  } = inputs;

  return {
    projects: isLoadingProjects ? 'active' : 'done',
    files: isLoadingFiles ? 'active' : 'done',
    store: storeStatusReady ? 'done' : 'active',
    designTokens: designTokensLoading ? 'active' : 'done',
    preview: previewReady ? 'done' : 'active',
    monaco: monacoReady ? 'done' : 'active',
    localSync: (localSyncStatus === 'disabled' || localSyncStatus === 'idle') ? 'done'
      : localSyncStatus === 'error' ? 'error'
      : (localSyncStatus === 'pulling' || localSyncStatus === 'pushing') ? 'active'
      : 'pending',
  };
}

/**
 * Aggregate all project loading states into a single typed list.
 * Debounces "done" transitions by MIN_DISPLAY_MS to prevent flicker.
 */
export function useProjectLoadingState(inputs: LoadingStateInputs): ProjectLoadingState {
  const rawStatuses = computeRawStatuses(inputs);

  const [displayed, setDisplayed] = useState<Record<string, RawStatus>>(rawStatuses);
  const activeTimestamps = useRef<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const next = { ...displayed };
    let changed = false;

    for (const def of ITEM_DEFS) {
      const raw = rawStatuses[def.id];
      const current = displayed[def.id] ?? 'pending';

      if (raw === current) continue;

      if (raw === 'active') {
        activeTimestamps.current[def.id] = Date.now();
        next[def.id] = 'active';
        changed = true;
        if (timers.current[def.id]) {
          clearTimeout(timers.current[def.id]);
          delete timers.current[def.id];
        }
      } else if (raw === 'done' || raw === 'error') {
        const activeAt = activeTimestamps.current[def.id];
        if (activeAt && current === 'active') {
          const elapsed = Date.now() - activeAt;
          if (elapsed < MIN_DISPLAY_MS) {
            if (!timers.current[def.id]) {
              const itemId = def.id;
              const targetStatus = raw;
              timers.current[itemId] = setTimeout(() => {
                delete activeTimestamps.current[itemId];
                delete timers.current[itemId];
                setDisplayed(prev => ({ ...prev, [itemId]: targetStatus }));
              }, MIN_DISPLAY_MS - elapsed);
            }
            continue;
          }
        }
        delete activeTimestamps.current[def.id];
        next[def.id] = raw;
        changed = true;
      } else {
        next[def.id] = raw;
        changed = true;
      }
    }

    if (changed) setDisplayed(next);

    return () => {
      for (const t of Object.values(timers.current)) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawStatuses)]);

  const items: LoadingItem[] = useMemo(
    () =>
      ITEM_DEFS.map(def => ({
        ...def,
        status: displayed[def.id] ?? 'pending',
      })),
    [displayed],
  );

  const criticalDone = useMemo(
    () => items.filter(i => i.critical).every(i => i.status === 'done'),
    [items],
  );

  const allDone = useMemo(
    () => items.every(i => i.status === 'done'),
    [items],
  );

  return { items, criticalDone, allDone };
}
