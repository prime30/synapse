'use client';
import { useState, useEffect, useCallback } from 'react';

interface InventoryProduct {
  id: string;
  title: string;
  variants: {
    id: string;
    title: string;
    sku: string;
    inventoryItemId: string;
  }[];
}

interface InventoryLocation {
  id: string;
  name: string;
  active: boolean;
}

interface InventoryLevel {
  inventoryItemId: string;
  locationId: string;
  available: number;
}

export function useShopifyInventory(connectionId: string | null) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [levels, setLevels] = useState<InventoryLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores/${connectionId}/inventory`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch inventory');
      setProducts(json.data?.products ?? []);
      setLocations(json.data?.locations ?? []);
      setLevels(json.data?.levels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  const setLevel = useCallback(
    async (inventoryItemId: string, locationId: string, quantity: number) => {
      if (!connectionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/inventory`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryItemId, locationId, quantity }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to update inventory level');
        setLevels((prev) =>
          prev.map((l) =>
            l.inventoryItemId === inventoryItemId && l.locationId === locationId
              ? { ...l, available: quantity }
              : l,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [connectionId],
  );

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  return { products, locations, levels, isLoading, error, refetch: fetchInventory, setLevel };
}
