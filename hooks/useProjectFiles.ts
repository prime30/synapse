'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import type { FileType } from '@/lib/types/files';

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  file_type: FileType;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

type SortOption = 'name' | 'type' | 'size' | 'date';

export function useProjectFiles(projectId: string | null) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('name');
  const [filter, setFilter] = useState<FileType | 'all'>('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error('Failed to fetch files');
      const json = await res.json();
      return (json.data ?? []) as ProjectFile[];
    },
    enabled: !!projectId,
  });

  const filteredAndSorted = useMemo(() => {
    let files = data ?? [];

    if (search) {
      const q = search.toLowerCase();
      files = files.filter((f) => f.name.toLowerCase().includes(q));
    }

    if (filter !== 'all') {
      files = files.filter((f) => f.file_type === filter);
    }

    const sorted = [...files].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'type':
          return a.file_type.localeCompare(b.file_type) || a.name.localeCompare(b.name);
        case 'size':
          return b.size_bytes - a.size_bytes;
        case 'date':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default:
          return 0;
      }
    });

    return sorted;
  }, [data, search, filter, sort]);

  return {
    files: filteredAndSorted,
    rawFiles: data ?? [],
    isLoading,
    error,
    refetch,
    search,
    setSearch,
    sort,
    setSort,
    filter,
    setFilter,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}
