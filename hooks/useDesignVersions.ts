'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface DesignVersion {
  id: string;
  project_id: string;
  version_number: number;
  changes: {
    tokenChanges?: Array<{
      type: string;
      tokenName: string;
      oldValue?: string;
      newValue?: string;
    }>;
    filesModified?: string[];
    instancesChanged?: number;
  };
  author_id: string | null;
  description: string | null;
  created_at: string;
}

async function fetchVersions(projectId: string): Promise<DesignVersion[]> {
  const res = await fetch(`/api/projects/${projectId}/design-tokens/versions`);
  if (!res.ok) throw new Error('Failed to fetch design system versions');
  const json = await res.json();
  return json.data?.versions ?? [];
}

async function rollbackVersion(projectId: string, versionId: string): Promise<void> {
  const res = await fetch(
    `/api/projects/${projectId}/design-tokens/versions/${versionId}/rollback`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Rollback failed');
  }
}

export function useDesignVersions(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const {
    data: versions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['design-versions', projectId],
    queryFn: () => fetchVersions(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => rollbackVersion(projectId!, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-versions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['design-tokens', projectId] });
    },
  });

  const rollback = useCallback(
    (versionId: string) => rollbackMutation.mutateAsync(versionId),
    [rollbackMutation],
  );

  return {
    versions,
    isLoading,
    error,
    refetch,
    rollback,
    isRollingBack: rollbackMutation.isPending,
    rollbackError: rollbackMutation.error,
  };
}
