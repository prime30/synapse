'use client';

import { useState, useEffect, useCallback } from 'react';

export interface DesignComponent {
  id?: string;
  name: string;
  file_path: string;
  component_type: string;
  files: string[];
  tokens_used: string[];
  usage_frequency: number;
}

export interface UseDesignComponentsReturn {
  components: DesignComponent[];
  count: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDesignComponents(projectId: string): UseDesignComponentsReturn {
  const [components, setComponents] = useState<DesignComponent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComponents = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/components`);
      if (!res.ok) throw new Error(`Failed to fetch components (${res.status})`);
      const json = await res.json();
      const list: DesignComponent[] = json.data?.components ?? json.components ?? [];
      setComponents(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  return {
    components,
    count: components.length,
    isLoading,
    error,
    refetch: fetchComponents,
  };
}
