'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';

export interface DevStoreStatus {
  connected: boolean;
  storeDomain?: string;
  themeName?: string;
  themeId?: string;
  lastPushAt?: string | null;
  pendingFileCount?: number;
}

export interface DevStoreConflict {
  path: string;
  localContent: string;
  remoteContent: string;
}

export interface PushProgress {
  type: 'start' | 'progress' | 'error' | 'complete';
  pushed?: number;
  total?: number;
  current?: string;
  errors?: { path: string; error: string }[];
  duration_ms?: number;
}

export interface SyncCheckResult {
  pulled: number;
  conflicts: DevStoreConflict[];
  unchanged: number;
}

export function useDevStorePreview(projectId: string) {
  const queryClient = useQueryClient();
  const [pushProgress, setPushProgress] = useState<PushProgress | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const statusQuery = useQuery({
    queryKey: ['dev-store-status', projectId],
    queryFn: async (): Promise<DevStoreStatus> => {
      const res = await fetch(`/api/projects/${projectId}/dev-store`);
      if (!res.ok) throw new Error('Failed to fetch dev store status');
      return res.json();
    },
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });

  const connectMutation = useMutation({
    mutationFn: async (params: {
      storeDomain: string;
      adminApiToken: string;
      tkaPassword?: string;
    }) => {
      const res = await fetch(`/api/projects/${projectId}/dev-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to connect dev store');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-store-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/dev-store`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to disconnect dev store');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-store-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const pushToDevStore = useCallback(async () => {
    setIsPushing(true);
    setPushProgress(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/projects/${projectId}/push-dev-store`, {
        method: 'POST',
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.status === 'conflicts') {
          setPushProgress(null);
          setIsPushing(false);
          return { conflicts: json.conflicts as DevStoreConflict[] };
        }
        throw new Error(json.error ?? 'Push failed');
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const dataMatch = line.match(/^data:\s*(.+)$/m);
            if (dataMatch) {
              try {
                const progress = JSON.parse(dataMatch[1]) as PushProgress;
                setPushProgress(progress);
              } catch {
                // skip malformed SSE
              }
            }
          }
        }
      } else {
        const json = await res.json();
        setPushProgress({
          type: 'complete',
          pushed: json.pushed,
          total: json.total,
          duration_ms: json.duration_ms,
          errors: json.errors,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['dev-store-status', projectId] });
      return { conflicts: null };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { conflicts: null };
      throw err;
    } finally {
      setIsPushing(false);
      abortRef.current = null;
    }
  }, [projectId, queryClient]);

  const cancelPush = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const syncCheckMutation = useMutation({
    mutationFn: async (): Promise<SyncCheckResult> => {
      const res = await fetch(`/api/projects/${projectId}/dev-store/sync-check`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Sync check failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-store-status', projectId] });
    },
  });

  const resolveConflictMutation = useMutation({
    mutationFn: async (params: {
      filePath: string;
      resolution: 'local' | 'remote';
      remoteContent?: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/dev-store/resolve-conflict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
      );
      if (!res.ok) throw new Error('Failed to resolve conflict');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-store-status', projectId] });
    },
  });

  return {
    status: statusQuery.data ?? { connected: false },
    isLoadingStatus: statusQuery.isLoading,
    refetchStatus: statusQuery.refetch,

    connectStore: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,

    disconnectStore: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,

    pushToDevStore,
    isPushing,
    pushProgress,
    cancelPush,

    syncCheck: syncCheckMutation.mutateAsync,
    isSyncChecking: syncCheckMutation.isPending,
    syncCheckResult: syncCheckMutation.data ?? null,

    resolveConflict: resolveConflictMutation.mutateAsync,
    isResolvingConflict: resolveConflictMutation.isPending,
  };
}
