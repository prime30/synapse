import { WebSocketServer } from 'ws';

let wss: WebSocketServer | null = null;

export function getWebSocketServer(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
  }
  return wss;
}
