'use client';

import { useEffect, useState } from 'react';

export interface WorkspacePresence {
  user_id: string;
  file_path: string | null;
  state: 'active' | 'idle' | 'offline';
  color: string;
  last_active_at: string;
}

export function useWorkspacePresence(workspaceId: string) {
  const [presence, setPresence] = useState<WorkspacePresence[]>([]);

  useEffect(() => {
    if (!workspaceId) return;

    let mounted = true;
    const load = async () => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/presence`);
      const json = await res.json();
      if (mounted) {
        setPresence((json.data?.presence ?? []) as WorkspacePresence[]);
      }
    };

    load();
    const interval = window.setInterval(load, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [workspaceId]);

  return presence;
}
