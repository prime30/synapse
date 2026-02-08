'use client';

import { useEffect, useMemo, useState } from 'react';

export interface RemoteCursor {
  userId: string;
  filePath?: string;
  position?: { line: number; column: number };
  color?: string;
}

interface UseRemoteCursorsOptions {
  workspaceId: string;
  token?: string;
}

export function useRemoteCursors({ workspaceId, token }: UseRemoteCursorsOptions) {
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const wsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    return `/api/ws/workspace/${workspaceId}?${params.toString()}`;
  }, [workspaceId, token]);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'cursor_update') return;
        const cursor: RemoteCursor = {
          userId: msg.userId,
          filePath: msg.filePath,
          position: msg.position,
          color: msg.color,
        };
        setCursors((prev) => ({ ...prev, [msg.userId]: cursor }));
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [workspaceId, wsUrl]);

  return Object.values(cursors);
}
