'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface StoreConnectionInfo {
  id: string;
  store_domain: string;
  theme_id: string | null;
  is_active: boolean;
  sync_status: 'connected' | 'syncing' | 'error' | 'disconnected';
  scopes: string[];
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to manage the user's active Shopify store connection.
 * This is the top-level store context (user > store > themes/projects).
 */
export function useActiveStore(projectId?: string) {
  const queryClient = useQueryClient();

  // ── Active store query ─────────────────────────────────────────────────
  const activeQuery = useQuery({
    queryKey: projectId ? ['active-store', projectId] : ['active-store'],
    queryFn: async (): Promise<StoreConnectionInfo | null> => {
      const query = projectId
        ? `?active=true&projectId=${encodeURIComponent(projectId)}`
        : '?active=true';
      const res = await fetch(`/api/stores${query}`);
      if (!res.ok) throw new Error('Failed to fetch active store');
      const json = await res.json();
      return (json.data?.connection ?? null) as StoreConnectionInfo | null;
    },
    retry: false, // Fail fast — don't block the UI with retries
  });

  // ── All stores query ───────────────────────────────────────────────────
  const allStoresQuery = useQuery({
    queryKey: projectId ? ['all-stores', projectId] : ['all-stores'],
    queryFn: async (): Promise<StoreConnectionInfo[]> => {
      const query = projectId
        ? `?projectId=${encodeURIComponent(projectId)}`
        : '';
      const res = await fetch(`/api/stores${query}`);
      if (!res.ok) throw new Error('Failed to fetch stores');
      const json = await res.json();
      return (json.data ?? []) as StoreConnectionInfo[];
    },
    retry: false,
  });

  // ── Connect a new store ────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async ({
      storeDomain,
      adminApiToken,
      projectId: bodyProjectId,
    }: {
      storeDomain: string;
      adminApiToken: string;
      projectId?: string;
    }): Promise<StoreConnectionInfo> => {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeDomain,
          adminApiToken,
          projectId: bodyProjectId ?? projectId,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to connect store');
      }
      const json = await res.json();
      return json.data?.connection as StoreConnectionInfo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-store'] });
      queryClient.invalidateQueries({ queryKey: ['all-stores'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Switch active store ────────────────────────────────────────────────
  const switchMutation = useMutation({
    mutationFn: async (connectionId: string): Promise<StoreConnectionInfo | null> => {
      const res = await fetch('/api/stores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, projectId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to switch store');
      }
      const json = await res.json();
      return (json.data?.connection ?? null) as StoreConnectionInfo | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-store'] });
      queryClient.invalidateQueries({ queryKey: ['all-stores'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Import a theme from the active store ───────────────────────────────
  const importMutation = useMutation({
    mutationFn: async ({
      connectionId,
      themeId,
      themeName,
      createDevThemeForPreview,
      note,
    }: {
      connectionId: string;
      themeId: number;
      themeName?: string;
      createDevThemeForPreview?: boolean;
      note?: string;
    }) => {
      const res = await fetch(`/api/stores/${connectionId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId, themeName, createDevThemeForPreview, note }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Import failed');
      }
      const json = await res.json();
      return json.data as {
        projectId: string;
        projectName: string;
        pulled: number;
        pushed: number;
        errors: string[];
        conflicts: string[];
        previewThemeId: string | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['active-store'] });
    },
  });

  return {
    // Active store
    connection: activeQuery.data ?? null,
    isLoading: activeQuery.isLoading,
    error: activeQuery.error,
    refetch: activeQuery.refetch,

    // All stores
    allStores: allStoresQuery.data ?? [],
    isLoadingStores: allStoresQuery.isLoading,

    // Actions
    connectStore: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,

    switchStore: switchMutation.mutateAsync,
    isSwitching: switchMutation.isPending,

    importTheme: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    importError: importMutation.error,
  };
}
