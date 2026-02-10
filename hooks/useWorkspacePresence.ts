'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { assignUserColor } from '@/lib/collaboration/user-colors';

export interface WorkspacePresence {
  user_id: string;
  file_path: string | null;
  state: 'active' | 'idle' | 'offline';
  color: string;
  last_active_at: string;
}

interface PresencePayload {
  user_id: string;
  file_path: string | null;
  state: 'active' | 'idle' | 'offline';
  color: string;
  last_active_at: string;
}

export interface UseWorkspacePresenceOptions {
  /** Current file path to broadcast as this user's location (optional) */
  filePath?: string | null;
  /** Current state (default: active) */
  state?: 'active' | 'idle' | 'offline';
}

export function useWorkspacePresence(
  workspaceId: string,
  options: UseWorkspacePresenceOptions = {}
) {
  const { filePath = null, state = 'active' } = options;
  const [presence, setPresence] = useState<WorkspacePresence[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const client = createClient();
    const channelName = `workspace:${workspaceId}`;
    const channel = client.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const stateMap = channel.presenceState<PresencePayload>();
        const list: WorkspacePresence[] = [];
        for (const key of Object.keys(stateMap)) {
          const payloads = stateMap[key] ?? [];
          for (const p of payloads) {
            if (p?.user_id) {
              list.push({
                user_id: p.user_id,
                file_path: p.file_path ?? null,
                state: p.state ?? 'active',
                color: p.color ?? assignUserColor(p.user_id),
                last_active_at: p.last_active_at ?? new Date().toISOString(),
              });
            }
          }
        }
        setPresence(list);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        await channel.track({
          user_id: user.id,
          file_path: filePath,
          state,
          color: assignUserColor(user.id),
          last_active_at: new Date().toISOString(),
        });
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspaceId, filePath, state]);

  // Update tracked presence when filePath or state changes
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !workspaceId) return;

    const client = createClient();
    client.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      ch.track({
        user_id: user.id,
        file_path: filePath,
        state,
        color: assignUserColor(user.id),
        last_active_at: new Date().toISOString(),
      });
    });
  }, [workspaceId, filePath, state]);

  return presence;
}
