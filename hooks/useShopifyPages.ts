'use client';
import { useState, useEffect, useCallback } from 'react';

interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  body_html: string;
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  template_suffix: string | null;
}

interface CreatePagePayload {
  title: string;
  body_html: string;
  published?: boolean;
  template_suffix?: string | null;
}

interface UpdatePagePayload {
  title?: string;
  body_html?: string;
  published?: boolean;
  template_suffix?: string | null;
}

export function useShopifyPages(connectionId: string | null) {
  const [pages, setPages] = useState<ShopifyPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores/${connectionId}/pages`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch pages');
      setPages(json.data?.pages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  const createPage = useCallback(
    async (payload: CreatePagePayload) => {
      if (!connectionId) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/pages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create page');
        const created = json.data?.page;
        if (created) setPages((prev) => [created, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId],
  );

  const updatePage = useCallback(
    async (pageId: string, payload: UpdatePagePayload) => {
      if (!connectionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/pages`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId, ...payload }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to update page');
        const updated = json.data?.page;
        if (updated) {
          setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [connectionId],
  );

  const deletePage = useCallback(
    async (pageId: string) => {
      if (!connectionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/stores/${connectionId}/pages`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to delete page');
        setPages((prev) => prev.filter((p) => p.id !== pageId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [connectionId],
  );

  useEffect(() => { fetchPages(); }, [fetchPages]);

  return { pages, isLoading, error, refetch: fetchPages, createPage, updatePage, deletePage };
}
