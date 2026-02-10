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
}

export function useProjects() {
  const queryClient = useQueryClient();

  // ── List projects ─────────────────────────────────────────────────────────
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<Project[]> => {
      // #region agent log H4
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H4',location:'hooks/useProjects.ts:24',message:'projects query start',data:{queryKey:'projects'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const res = await fetch('/api/projects');
      // #region agent log H4
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H4',location:'hooks/useProjects.ts:27',message:'projects query response',data:{ok:res.ok,status:res.status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!res.ok) throw new Error('Failed to fetch projects');
      const json = await res.json();
      return (json.data ?? []) as Project[];
    },
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
