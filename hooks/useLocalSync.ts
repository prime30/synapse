'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
// IndexedDB cache integration is available via @/lib/cache/indexeddb-file-cache
// for future use when sync-to-disk returns file content for browser caching.

/**
 * useLocalSync — Manages the local disk sync lifecycle for a project.
 *
 * On mount (if enabled), calls POST /api/projects/{id}/sync-to-disk to
 * pull all theme files to .synapse-themes/{slug}/. Exposes sync status
 * so the UI can show a LocalSyncIndicator.
 *
 * Also provides pushToDevTheme() to push pending local changes to the
 * Shopify development theme.
 *
 * Only active when NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1'.
 */

export type LocalSyncStatus = 'disabled' | 'idle' | 'pulling' | 'pushing' | 'error';

interface UseLocalSyncReturn {
  /** Current sync status */
  status: LocalSyncStatus;
  /** Absolute path to local theme directory (null until first sync) */
  localPath: string | null;
  /** Error message if status is 'error' */
  error: string | null;
  /** Number of files synced */
  fileCount: number;
  /** Whether local sync is enabled via env var */
  enabled: boolean;
  /** Push pending local changes to Shopify dev theme */
  pushToDevTheme: () => Promise<void>;
  /** Result of last push (null if never pushed) */
  lastPush: { pushed: number; errors: string[] } | null;
}

const SYNC_CACHE_KEY = 'synapse-local-sync-done';
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function useLocalSync(projectId: string | null): UseLocalSyncReturn {
  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1';

  const [status, setStatus] = useState<LocalSyncStatus>(isEnabled ? 'idle' : 'disabled');
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [lastPush, setLastPush] = useState<{ pushed: number; errors: string[] } | null>(null);
  const didSync = useRef(false);

  const syncToDisk = useCallback(async () => {
    if (!projectId || !isEnabled) return;

    // Check if we already synced this session (avoid re-pulling on tab switch)
    try {
      const cached = sessionStorage.getItem(`${SYNC_CACHE_KEY}-${projectId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < STALE_THRESHOLD_MS) {
          setLocalPath(parsed.localPath);
          setFileCount(parsed.fileCount);
          setStatus('idle');
          return;
        }
      }
    } catch { /* sessionStorage unavailable or parse error */ }

    setStatus('pulling');
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/sync-to-disk`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      }

      const { data } = await res.json();

      if (!data.enabled) {
        setStatus('disabled');
        return;
      }

      setLocalPath(data.localPath);
      setFileCount(data.fileCount);
      setStatus('idle');

      // Cache the result in sessionStorage
      try {
        sessionStorage.setItem(
          `${SYNC_CACHE_KEY}-${projectId}`,
          JSON.stringify({
            localPath: data.localPath,
            fileCount: data.fileCount,
            timestamp: Date.now(),
          }),
        );
      } catch { /* sessionStorage unavailable */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Local sync failed');
      setStatus('error');
    }
  }, [projectId, isEnabled]);

  const pushToDevTheme = useCallback(async () => {
    if (!projectId || !isEnabled) return;

    setStatus('pushing');
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/sync-dev-theme`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Push failed (${res.status})`);
      }

      const { data } = await res.json();
      const pushed = data.pushed ?? 0;
      const errors = data.errors ?? [];
      setLastPush({ pushed, errors });

      if (errors.length > 0 && pushed === 0) {
        throw new Error(errors[0]);
      }

      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push to dev theme failed');
      setStatus('error');
    }
  }, [projectId, isEnabled]);

  useEffect(() => {
    if (didSync.current || !isEnabled || !projectId) return;
    didSync.current = true;
    syncToDisk();
  }, [syncToDisk, isEnabled, projectId]);

  return {
    status,
    localPath,
    error,
    fileCount,
    enabled: isEnabled,
    pushToDevTheme,
    lastPush,
  };
}
