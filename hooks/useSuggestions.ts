'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Suggestion } from '@/lib/types/suggestion';

interface UseSuggestionsOptions {
  projectId: string;
  fileId?: string;
  status?: 'pending' | 'applied' | 'rejected' | 'edited' | 'undone' | undefined;
}

interface GenerateSuggestionsParams {
  fileId: string;
  projectId: string;
}

interface ApplySuggestionParams {
  id: string;
  editedCode?: string;
}

export function useSuggestions({
  projectId,
  fileId,
  status,
}: UseSuggestionsOptions) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['suggestions', projectId, fileId, status],
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
      });
      if (status) {
        params.append('status', status);
      }
      if (fileId) {
        params.append('fileId', fileId);
      }

      const res = await fetch(`/api/suggestions/history?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const json = await res.json();
      return (json.data ?? []) as Suggestion[];
    },
    enabled: !!projectId,
  });

  const generateMutation = useMutation({
    mutationFn: async ({ fileId, projectId }: GenerateSuggestionsParams) => {
      const res = await fetch('/api/suggestions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, projectId }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to generate suggestions');
      }
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', projectId] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ id, editedCode }: ApplySuggestionParams) => {
      const res = await fetch(`/api/suggestions/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedCode }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to apply suggestion');
      }
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', projectId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/suggestions/${id}/reject`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to reject suggestion');
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', projectId] });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/suggestions/${id}/undo`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to undo suggestion');
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', projectId] });
    },
  });

  return {
    suggestions: data ?? [],
    isLoading,
    generate: generateMutation.mutateAsync,
    apply: applyMutation.mutateAsync,
    reject: rejectMutation.mutateAsync,
    undo: undoMutation.mutateAsync,
    refetch,
    isGenerating: generateMutation.isPending,
    isApplying: applyMutation.isPending,
    isRejecting: rejectMutation.isPending,
    isUndoing: undoMutation.isPending,
  };
}
