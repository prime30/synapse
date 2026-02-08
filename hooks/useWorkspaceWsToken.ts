'use client';

import { useQuery } from '@tanstack/react-query';

export function useWorkspaceWsToken(workspaceId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-ws-token', workspaceId],
    queryFn: async (): Promise<string> => {
      if (!workspaceId) throw new Error('No workspace');
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/ws-token`);
      if (!res.ok) throw new Error('Failed to get WS token');
      const json = await res.json();
      return (json.data?.token as string) ?? '';
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  return { token: data ?? null, isLoading };
}
