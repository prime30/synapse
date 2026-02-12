'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface ShopifyAssetInfo {
  key: string;
  value?: string;
  content_type: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export function useShopifyAssets(
  connectionId: string | null,
  themeId: number | null
) {
  const queryClient = useQueryClient();

  const enabled = Boolean(connectionId && themeId);
  const queryKey = ['shopify-assets', connectionId, themeId] as const;

  // ── List assets ────────────────────────────────────────────────────────────
  const assetsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<ShopifyAssetInfo[]> => {
      const res = await fetch(
        `/api/stores/${connectionId}/themes/${themeId}/assets`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to fetch assets');
      }
      const json = await res.json();
      return json.data as ShopifyAssetInfo[];
    },
    enabled,
  });

  // ── Upload / create asset ──────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: string;
      value: string;
    }): Promise<ShopifyAssetInfo> => {
      const res = await fetch(
        `/api/stores/${connectionId}/themes/${themeId}/assets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to upload asset');
      }
      const json = await res.json();
      return json.data as ShopifyAssetInfo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Delete asset ───────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (key: string): Promise<void> => {
      const res = await fetch(
        `/api/stores/${connectionId}/themes/${themeId}/assets?key=${encodeURIComponent(key)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to delete asset');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    assets: assetsQuery.data ?? [],
    isLoading: assetsQuery.isLoading,
    error: assetsQuery.error,
    refetch: assetsQuery.refetch,

    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,

    deleteAsset: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
