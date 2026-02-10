'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';

// ── Client-safe types (mirrors server types without importing server modules) ──

export interface ShopifyConnectionInfo {
  id: string;
  store_domain: string;
  /** Persisted dev theme ID for preview (from theme provisioning). */
  theme_id: string | null;
  sync_status: 'connected' | 'syncing' | 'error' | 'disconnected';
  scopes: string[];
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionStatus {
  connected: boolean;
  connection: ShopifyConnectionInfo | null;
}

export interface ShopifyTheme {
  id: number;
  name: string;
  role: 'main' | 'unpublished' | 'demo';
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: string[];
  errors: string[];
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useShopifyConnection(projectId: string) {
  const queryClient = useQueryClient();

  // ── Fetch connection status ───────────────────────────────────────────────
  const statusQuery = useQuery({
    queryKey: ['shopify-connection', projectId],
    queryFn: async (): Promise<ConnectionStatus> => {
      const res = await fetch(`/api/projects/${projectId}/shopify`);
      if (!res.ok) throw new Error('Failed to fetch Shopify connection status');
      const json = await res.json();
      return json.data as ConnectionStatus;
    },
  });

  // ── Connect: redirect to Shopify OAuth install flow ───────────────────────
  const connectOAuth = (shop: string) => {
    const params = new URLSearchParams({ shop, projectId });
    window.location.href = `/api/shopify/install?${params.toString()}`;
  };

  // ── Connect: manual Admin API token ──────────────────────────────────────
  const connectManualMutation = useMutation({
    mutationFn: async ({
      storeDomain,
      adminApiToken,
    }: {
      storeDomain: string;
      adminApiToken: string;
    }): Promise<ConnectionStatus> => {
      const res = await fetch(`/api/projects/${projectId}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeDomain, adminApiToken }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to connect');
      }
      const json = await res.json();
      return json.data as ConnectionStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['shopify-connection', projectId],
      });
    },
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/shopify`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to disconnect');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['shopify-connection', projectId],
      });
      emitPreviewSyncComplete(projectId);
    },
  });

  // ── Sync (pull or push) ───────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: async ({
      action,
      themeId,
      note,
    }: {
      action: 'pull' | 'push';
      themeId?: number;
      note?: string;
    }): Promise<SyncResult> => {
      const body: { action: 'pull' | 'push'; themeId?: number; note?: string } = { action };
      if (themeId !== undefined && Number.isFinite(themeId)) body.themeId = themeId;
      if (typeof note === 'string' && note.trim()) body.note = note.trim();
      const res = await fetch(`/api/projects/${projectId}/shopify/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Sync failed');
      }
      const json = await res.json();
      return json.data as SyncResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['shopify-connection', projectId],
      });
    },
  });

  // ── List themes ───────────────────────────────────────────────────────────
  const themesQuery = useQuery({
    queryKey: ['shopify-themes', projectId],
    queryFn: async (): Promise<ShopifyTheme[]> => {
      const res = await fetch(`/api/projects/${projectId}/shopify/themes`);
      if (!res.ok) throw new Error('Failed to fetch themes');
      const json = await res.json();
      return json.data as ShopifyTheme[];
    },
    enabled: statusQuery.data?.connected === true,
  });

  return {
    // Connection status
    connection: statusQuery.data?.connection ?? null,
    connected: statusQuery.data?.connected ?? false,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
    refetch: statusQuery.refetch,

    // Actions
    connectOAuth,
    connectManual: connectManualMutation.mutateAsync,
    isConnecting: connectManualMutation.isPending,
    connectError: connectManualMutation.error,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,

    sync: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
    syncResult: syncMutation.data ?? null,

    // Themes
    themes: themesQuery.data ?? [],
    isLoadingThemes: themesQuery.isLoading,
    themesError: themesQuery.error,
    refetchThemes: themesQuery.refetch,
  };
}
