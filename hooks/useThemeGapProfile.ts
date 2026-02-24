'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ThemeGapResult } from '@/lib/ai/theme-gap-detector';

interface UseThemeGapProfileOptions {
  projectId: string;
  enabled?: boolean;
}

export function useThemeGapProfile({ projectId, enabled = true }: UseThemeGapProfileOptions) {
  const [gapProfile, setGapProfile] = useState<ThemeGapResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!enabled || !projectId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/health/gap`);
      if (res.ok) {
        const json = (await res.json()) as { data?: ThemeGapResult };
        if (json.data) setGapProfile(json.data);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { gapProfile, isLoading, refetch: fetchProfile };
}
