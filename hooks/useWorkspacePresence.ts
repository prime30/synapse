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
  full_name?: string | null;
  avatar_url?: string | null;
}

interface PresencePayload {
  user_id: string;
  file_path: string | null;
  state: 'active' | 'idle' | 'offline';
  color: string;
  last_active_at: string;
  full_name?: string | null;
  avatar_url?: string | null;
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
                full_name: p.full_name ?? null,
                avatar_url: p.avatar_url ?? null,
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
        let full_name: string | null = null;
        let avatar_url: string | null = null;
        const { data: profile } = await client
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single();
        if (profile) {
          full_name = profile.full_name ?? null;
          avatar_url = profile.avatar_url ?? null;
        }
        if (full_name == null && user.user_metadata) {
          full_name = user.user_metadata.full_name ?? null;
          avatar_url = avatar_url ?? user.user_metadata.avatar_url ?? null;
        }
        await channel.track({
          user_id: user.id,
          file_path: filePath,
          state,
          color: assignUserColor(user.id),
          last_active_at: new Date().toISOString(),
          full_name: full_name ?? undefined,
          avatar_url: avatar_url ?? undefined,
        });
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspaceId, filePath, state]);

  // Update tracked presence when filePath or state changes (re-fetch profile so edits show)
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !workspaceId) return;

    const client = createClient();
    (async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      let full_name: string | null = null;
      let avatar_url: string | null = null;
      const { data: profile } = await client
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      if (profile) {
        full_name = profile.full_name ?? null;
        avatar_url = profile.avatar_url ?? null;
      }
      if (full_name == null && user.user_metadata) {
        full_name = user.user_metadata.full_name ?? null;
        avatar_url = avatar_url ?? user.user_metadata.avatar_url ?? null;
      }
      await ch.track({
        user_id: user.id,
        file_path: filePath,
        state,
        color: assignUserColor(user.id),
        last_active_at: new Date().toISOString(),
        full_name: full_name ?? undefined,
        avatar_url: avatar_url ?? undefined,
      });
    })();
  }, [workspaceId, filePath, state]);

  // Re-track when profile is updated elsewhere (e.g. Edit profile modal) so other clients see new name/avatar
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !workspaceId) return;

    function handleProfileUpdated() {
      const client = createClient();
      (async () => {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        let full_name: string | null = null;
        let avatar_url: string | null = null;
        const { data: profile } = await client
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single();
        if (profile) {
          full_name = profile.full_name ?? null;
          avatar_url = profile.avatar_url ?? null;
        }
        if (full_name == null && user.user_metadata) {
          full_name = user.user_metadata.full_name ?? null;
          avatar_url = avatar_url ?? user.user_metadata.avatar_url ?? null;
        }
        await ch.track({
          user_id: user.id,
          file_path: filePath,
          state,
          color: assignUserColor(user.id),
          last_active_at: new Date().toISOString(),
          full_name: full_name ?? undefined,
          avatar_url: avatar_url ?? undefined,
        });
      })();
    }

    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('profile-updated', handleProfileUpdated);
  }, [workspaceId, filePath, state]);

  return presence;
}
