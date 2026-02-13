'use client';

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';

interface UseResizablePanelOptions {
  /** localStorage key to persist the width under */
  storageKey: string;
  /** Default width in pixels */
  defaultWidth: number;
  /** Minimum allowed width in pixels */
  minWidth: number;
  /** Maximum allowed width in pixels */
  maxWidth: number;
}

function loadWidth(
  key: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): number {
  if (typeof window === 'undefined') return defaultWidth;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultWidth;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= minWidth && parsed <= maxWidth) {
      return parsed;
    }
    return defaultWidth;
  } catch {
    return defaultWidth;
  }
}

function saveWidth(key: string, width: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // ignore
  }
}

/**
 * Read a localStorage value safely for SSR: returns `defaultWidth` on the
 * server and during hydration, then the real persisted value on the client.
 * Uses `useSyncExternalStore` so React can reconcile without a hydration mismatch.
 */
function usePersistedWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Listen for storage events (e.g. from another tab)
      const handler = (e: StorageEvent) => {
        if (e.key === storageKey) onStoreChange();
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    [storageKey],
  );

  const getSnapshot = useCallback(
    () => loadWidth(storageKey, defaultWidth, minWidth, maxWidth),
    [storageKey, defaultWidth, minWidth, maxWidth],
  );

  // Server snapshot always returns the default (avoids hydration mismatch)
  const getServerSnapshot = useCallback(() => defaultWidth, [defaultWidth]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseResizablePanelOptions) {
  // Read persisted width safely (SSR-compatible, no hydration mismatch)
  const persistedWidth = usePersistedWidth(storageKey, defaultWidth, minWidth, maxWidth);
  const [width, setWidthState] = useState(persistedWidth);

  // Sync when persisted value changes (e.g. first client render after hydration, or other tab)
  useEffect(() => {
    setWidthState(persistedWidth);
  }, [persistedWidth]);

  const setWidth = useCallback(
    (w: number) => {
      const next = Math.min(maxWidth, Math.max(minWidth, w));
      setWidthState(next);
      // Persist immediately so useSyncExternalStore getSnapshot sees it on next render;
      // avoids the sync effect overwriting with stale persistedWidth during drag.
      saveWidth(storageKey, next);
    },
    [storageKey, minWidth, maxWidth]
  );

  const resetWidth = useCallback(() => {
    setWidthState(defaultWidth);
    saveWidth(storageKey, defaultWidth);
  }, [storageKey, defaultWidth]);

  return { width, setWidth, resetWidth, minWidth, maxWidth };
}
