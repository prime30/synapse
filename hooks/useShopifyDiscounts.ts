'use client';
import { useState, useEffect, useCallback } from 'react';

interface PriceRule {
  id: string;
  title: string;
  value_type: string;
  value: string;
  target_type: string;
  target_selection: string;
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateDiscountPayload {
  title: string;
  value_type: 'fixed_amount' | 'percentage';
  value: string;
  target_type: 'line_item' | 'shipping_line';
  target_selection: 'all' | 'entitled';
  starts_at: string;
  ends_at?: string | null;
  usage_limit?: number | null;
  once_per_customer?: boolean;
}

export function useShopifyDiscounts(connectionId: string | null) {
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiscounts = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores/${connectionId}/discounts`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch discounts');
      setPriceRules(json.data?.priceRules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  const createDiscount = useCallback(
    async (payload: CreateDiscountPayload) => {
      if (!connectionId) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/discounts`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create discount');
        const created = json.data?.priceRule;
        if (created) setPriceRules((prev) => [created, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId],
  );

  const deleteDiscount = useCallback(
    async (priceRuleId: string) => {
      if (!connectionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/discounts`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceRuleId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to delete discount');
        setPriceRules((prev) => prev.filter((r) => r.id !== priceRuleId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [connectionId],
  );

  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  return { priceRules, isLoading, error, refetch: fetchDiscounts, createDiscount, deleteDiscount };
}
