'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const LAST_PROJECT_KEY = 'synapse-last-project';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string;
  shopify_connection_id?: string | null;
  shopify_theme_id?: string | null;
  shopify_theme_name?: string | null;
  /** Per-project Shopify development theme for preview */
  dev_theme_id?: string | null;
  /** Project status: 'active' | 'archived'. Undefined treated as 'active' for pre-migration compat. */
  status?: 'active' | 'archived' | null;
}

export interface ReconcileResult {
  archived: number;
  restored: number;
  archivedProjectIds: string[];
  archivedProjectNames: string[];
}

/**
 * @param connectionId - Optional: filter projects by store connection ID.
 *   When provided, only projects imported from that store are returned.
 */
export function useProjects(connectionId?: string | null) {
  const queryClient = useQueryClient();

  // ── List projects ─────────────────────────────────────────────────────────
  const projectsQuery = useQuery({
    queryKey: connectionId ? ['projects', connectionId] : ['projects'],
    queryFn: async (): Promise<Project[]> => {
      const url = connectionId
        ? `/api/projects?connectionId=${encodeURIComponent(connectionId)}`
        : '/api/projects';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch projects');
      const json = await res.json();
      return (json.data ?? []) as Project[];
    },
    retry: false,
  });

  // ── Create project ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }): Promise<{ id: string; name: string }> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to create project');
      }
      const json = await res.json();
      return json.data as { id: string; name: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Reconcile projects against Shopify ────────────────────────────────────
  const reconcileMutation = useMutation({
    mutationFn: async (): Promise<ReconcileResult> => {
      const res = await fetch('/api/projects/reconcile', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to reconcile projects');
      }
      const json = await res.json();
      return json.data as ReconcileResult;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Restore archived project ──────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to restore project');
      }
      return res.json();
    },
    // Optimistic update: move to active before API returns
    onMutate: async (projectId: string) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const previous = queryClient.getQueryData<Project[]>(['projects']);
      queryClient.setQueryData<Project[]>(['projects'], (old) =>
        (old ?? []).map((p) =>
          p.id === projectId ? { ...p, status: 'active' as const } : p
        )
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      // Revert optimistic update on error
      if (context?.previous) {
        queryClient.setQueryData(['projects'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Delete project permanently ────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to delete project');
      }
      return res.json();
    },
    // Optimistic update: remove from cache immediately
    onMutate: async (projectId: string) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const previous = queryClient.getQueryData<Project[]>(['projects']);
      queryClient.setQueryData<Project[]>(['projects'], (old) =>
        (old ?? []).filter((p) => p.id !== projectId)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['projects'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // ── Computed: active vs archived ──────────────────────────────────────────
  const allProjects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data]
  );

  const activeProjects = useMemo(
    () => allProjects.filter((p) => p.status !== 'archived'),
    [allProjects]
  );

  const archivedProjects = useMemo(
    () => allProjects.filter((p) => p.status === 'archived'),
    [allProjects]
  );

  // ── Last-opened project persistence ───────────────────────────────────────
  const getLastProjectId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
  }, []);

  const setLastProjectId = useCallback((projectId: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LAST_PROJECT_KEY, projectId);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    projects: allProjects,
    activeProjects,
    archivedProjects,
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    refetch: projectsQuery.refetch,

    createProject: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    reconcile: reconcileMutation.mutateAsync,
    isReconciling: reconcileMutation.isPending,

    restoreProject: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,

    deleteProject: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,

    getLastProjectId,
    setLastProjectId,
  };
}
