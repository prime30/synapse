import type { WebSocket } from 'ws';
import { getWebSocketServer } from '@/lib/collaboration/websocket-server';
import { connectionManager } from '@/lib/collaboration/connection-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ workspace_id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { workspace_id } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  const wss = getWebSocketServer();
  const { socket, headers } = request as unknown as {
    socket: any;
    headers: Record<string, string>;
  };

  if (!token) {
    socket.destroy();
    return new Response('Unauthorized', { status: 401 });
  }

  return new Promise<Response>((resolve) => {
    wss.handleUpgrade(request as any, socket, Buffer.alloc(0), (ws: WebSocket) => {
      connectionManager.add(workspace_id, ws);

      ws.on('message', (raw) => {
        const payload = raw.toString();
        connectionManager.broadcast(workspace_id, ws, payload);
      });

      ws.on('close', () => {
        connectionManager.remove(workspace_id, ws);
      });

      ws.send(
        JSON.stringify({
          type: 'connected',
          workspaceId: workspace_id,
        })
      );
    });

    resolve(new Response(null, { status: 101, headers }));
  });
}
