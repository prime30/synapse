import type { WebSocket } from 'ws';

type ConnectionMap = Map<string, Set<WebSocket>>;

class ConnectionManager {
  private connections: ConnectionMap = new Map();

  add(workspaceId: string, socket: WebSocket) {
    const set = this.connections.get(workspaceId) ?? new Set<WebSocket>();
    set.add(socket);
    this.connections.set(workspaceId, set);
  }

  remove(workspaceId: string, socket: WebSocket) {
    const set = this.connections.get(workspaceId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.connections.delete(workspaceId);
  }

  broadcast(workspaceId: string, sender: WebSocket, payload: string) {
    const set = this.connections.get(workspaceId);
    if (!set) return;
    for (const socket of set) {
      if (socket === sender || socket.readyState !== socket.OPEN) continue;
      socket.send(payload);
    }
  }
}

export const connectionManager = new ConnectionManager();
