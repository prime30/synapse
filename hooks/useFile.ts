'use client';

import { useQuery } from '@tanstack/react-query';
import {
  isIndexedDBAvailable,
  setCachedFileContent,
} from '@/lib/cache/indexeddb-file-cache';

export interface FileContent {
  id: string;
  name: string;
  content: string;
  file_type: string;
}

export function useFile(fileId: string | null, projectId?: string | null) {
  const query = useQuery({
    queryKey: ['file', fileId],
    queryFn: async () => {
      if (!fileId) return null;

      const res = await fetch(`/api/files/${fileId}`);
      if (!res.ok) throw new Error('Failed to fetch file');
      const json = await res.json();
      const data = json.data as FileContent;

      if (data && isIndexedDBAvailable()) {
        setCachedFileContent(fileId, projectId ?? '', data.content).catch(() => {});
      }

      return data;
    },
    placeholderData: () => {
      if (!fileId || !isIndexedDBAvailable()) return undefined;
      return undefined;
    },
    enabled: !!fileId,
  });

  return {
    file: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
