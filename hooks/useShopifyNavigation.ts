'use client';
import { useState, useEffect, useCallback } from 'react';

interface MenuItem {
  id: string;
  title: string;
  url: string;
  type: string;
  resource_id?: number | null;
  items?: MenuItem[];
}

interface Menu {
  id: string;
  title: string;
  handle: string;
  items: MenuItem[];
}

export function useShopifyNavigation(connectionId: string | null) {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMenus = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores/${connectionId}/navigation`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch menus');
      setMenus(json.data?.menus ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { fetchMenus(); }, [fetchMenus]);

  return { menus, isLoading, error, refetch: fetchMenus };
}
