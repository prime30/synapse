'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@/hooks/useProjects';

interface UseThumbnailsReturn {
  thumbnailUrls: Record<string, string>;
  generatingIds: Set<string>;
  regenerate: (projectId: string) => void;
}

export function useThumbnails(projects: Project[]): UseThumbnailsReturn {
  const queryClient = useQueryClient();
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const activeCountRef = useRef(0);
  const MAX_CONCURRENT = 3;

  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && activeCountRef.current < MAX_CONCURRENT) {
      const id = queueRef.current.shift();
      if (!id) break;

      activeCountRef.current++;
      setGeneratingIds((prev) => new Set([...prev, id]));

      try {
        const res = await fetch(`/api/projects/${id}/thumbnail`, { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          const url = json.data?.url;
          if (url) {
            setThumbnailUrls((prev) => ({ ...prev, [id]: `${url}?t=${Date.now()}` }));
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }
        }
      } catch {
        // Non-critical
      } finally {
        activeCountRef.current--;
        setGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        processQueue();
      }
    }
  }, [queryClient]);

  // On mount, queue projects missing thumbnails
  useEffect(() => {
    const needGeneration = projects.filter(
      (p) => !p.thumbnail_url && p.dev_theme_id && p.status !== 'archived'
    );

    if (needGeneration.length === 0) return;

    const ids = needGeneration.map((p) => p.id);
    queueRef.current = [...new Set([...queueRef.current, ...ids])];
    processQueue();
  }, [projects, processQueue]);

  // Initialize from project data
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const p of projects) {
      if (p.thumbnail_url && !thumbnailUrls[p.id]) {
        initial[p.id] = `${p.thumbnail_url}?t=${Date.now()}`;
      }
    }
    if (Object.keys(initial).length > 0) {
      setThumbnailUrls((prev) => ({ ...prev, ...initial }));
    }
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const regenerate = useCallback(
    (projectId: string) => {
      queueRef.current.push(projectId);
      processQueue();
    },
    [processQueue]
  );

  return { thumbnailUrls, generatingIds, regenerate };
}
