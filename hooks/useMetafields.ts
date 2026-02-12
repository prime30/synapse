'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ShopifyMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
  owner_resource: string;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMetafieldInput {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface UpdateMetafieldInput {
  id: number;
  value: string;
}

/** All known Shopify metafield types. */
export const METAFIELD_TYPES = [
  'single_line_text_field',
  'multi_line_text_field',
  'number_integer',
  'number_decimal',
  'json',
  'date',
  'date_time',
  'color',
  'boolean',
  'url',
  'money',
  'weight',
  'dimension',
  'rating',
  'volume',
  'rich_text_field',
] as const;

export type MetafieldType = (typeof METAFIELD_TYPES)[number];

/** Human-readable labels for metafield types. */
export const METAFIELD_TYPE_LABELS: Record<MetafieldType, string> = {
  single_line_text_field: 'Single line text',
  multi_line_text_field: 'Multi-line text',
  number_integer: 'Integer',
  number_decimal: 'Decimal',
  json: 'JSON',
  date: 'Date',
  date_time: 'Date & time',
  color: 'Color',
  boolean: 'Boolean',
  url: 'URL',
  money: 'Money',
  weight: 'Weight',
  dimension: 'Dimension',
  rating: 'Rating',
  volume: 'Volume',
  rich_text_field: 'Rich text',
};

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useMetafields(connectionId: string | null, namespace?: string) {
  const queryClient = useQueryClient();
  const queryKey = ['metafields', connectionId, namespace ?? null];

  // ── List metafields ─────────────────────────────────────────────────────────
  const metafieldsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<ShopifyMetafield[]> => {
      const params = new URLSearchParams();
      if (namespace) params.set('namespace', namespace);
      params.set('limit', '250');

      const res = await fetch(
        `/api/stores/${connectionId}/metafields?${params.toString()}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to fetch metafields');
      }
      const json = await res.json();
      return (json.data?.metafields ?? []) as ShopifyMetafield[];
    },
    enabled: !!connectionId,
  });

  // ── Create metafield ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateMetafieldInput): Promise<ShopifyMetafield> => {
      const res = await fetch(`/api/stores/${connectionId}/metafields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to create metafield');
      }
      const json = await res.json();
      return json.data?.metafield as ShopifyMetafield;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Update metafield ───────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateMetafieldInput): Promise<ShopifyMetafield> => {
      const res = await fetch(`/api/stores/${connectionId}/metafields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to update metafield');
      }
      const json = await res.json();
      return json.data?.metafield as ShopifyMetafield;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Delete metafield ───────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const res = await fetch(
        `/api/stores/${connectionId}/metafields?id=${id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to delete metafield');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    metafields: metafieldsQuery.data ?? [],
    isLoading: metafieldsQuery.isLoading,
    error: metafieldsQuery.error,
    refetch: metafieldsQuery.refetch,

    createMetafield: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    updateMetafield: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    deleteMetafield: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
