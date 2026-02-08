'use client';

import { useQuery } from '@tanstack/react-query';

export interface FileContent {
  id: string;
  name: string;
  content: string;
  file_type: string;
}

export function useFile(fileId: string | null) {
  const query = useQuery({
    queryKey: ['file', fileId],
    queryFn: async () => {
      if (!fileId) return null;
      const res = await fetch(`/api/files/${fileId}`);
      if (!res.ok) throw new Error('Failed to fetch file');
      const json = await res.json();
      return json.data as FileContent;
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
