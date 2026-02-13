'use client';
import { useState, useEffect, useCallback } from 'react';

interface ShopifyFile {
  id: string;
  alt: string | null;
  createdAt: string;
  fileStatus: string;
  preview?: {
    image?: { url: string };
  };
  url?: string;
  mimeType?: string;
  fileSize?: number;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export function useShopifyFiles(connectionId: string | null) {
  const [files, setFiles] = useState<ShopifyFile[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async (cursor?: string) => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(
        `/api/stores/${connectionId}/files?${params.toString()}`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch files');
      setFiles(json.data?.files ?? []);
      setPageInfo(json.data?.pageInfo ?? { hasNextPage: false, hasPreviousPage: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  const deleteFiles = useCallback(async (fileIds: string[]) => {
    if (!connectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores/${connectionId}/files`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete files');
      setFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  return { files, pageInfo, isLoading, error, refetch: fetchFiles, deleteFiles };
}
