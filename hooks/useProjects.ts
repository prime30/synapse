'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

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
    projects: projectsQuery.data ?? [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    refetch: projectsQuery.refetch,

    createProject: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    getLastProjectId,
    setLastProjectId,
  };
}
