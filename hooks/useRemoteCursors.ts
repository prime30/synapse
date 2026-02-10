'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface RemoteCursor {
  userId: string;
  filePath?: string;
  position?: { line: number; column: number };
  color?: string;
}

interface UseRemoteCursorsOptions {
  workspaceId: string;
  /** No longer used; kept for API compatibility. Cursors use Supabase Realtime. */
  token?: string;
}

export function useRemoteCursors({ workspaceId }: UseRemoteCursorsOptions) {
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  useEffect(() => {
    if (!workspaceId) return;

    const client = createClient();
    const channelName = `workspace:${workspaceId}`;
    const channel = client.channel(channelName);

    (channel as { on(type: string, filter: { event: string }, callback: (payload: unknown) => void): typeof channel })
      .on(
        'broadcast',
        { event: 'cursor_update' },
        (payload: unknown) => {
          const p = payload as { userId?: string; filePath?: string; position?: { line: number; column: number }; color?: string };
          const userId = p.userId;
          if (!userId) return;
          setCursors((prev) => ({
            ...prev,
            [userId]: {
              userId,
              filePath: p.filePath,
              position: p.position,
              color: p.color,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      client.removeChannel(channel);
    };
  }, [workspaceId]);

  return Object.values(cursors);
}
