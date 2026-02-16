import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { createClient } from '@/lib/supabase/client';

export interface CollaborationUser {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
}

export interface ProviderOptions {
  projectId: string;
  fileId: string;
  user: CollaborationUser;
  autoConnect?: boolean;
  updateDebounceMs?: number;
}

type ProviderStatus = 'disconnected' | 'connecting' | 'connected';
type StatusListener = (status: ProviderStatus) => void;

function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;

  private projectId: string;
  private fileId: string;
  private user: CollaborationUser;
  private updateDebounceMs: number;

  private channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
  private supabase = createClient();
  private _status: ProviderStatus = 'disconnected';
  private statusListeners: Set<StatusListener> = new Set();

  private pendingUpdate: Uint8Array | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private localUpdateInProgress = false;
  private synced = false;

  constructor(doc: Y.Doc, options: ProviderOptions) {
    this.doc = doc;
    this.projectId = options.projectId;
    this.fileId = options.fileId;
    this.user = options.user;
    this.updateDebounceMs = options.updateDebounceMs ?? 50;

    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField('user', {
      userId: this.user.userId,
      name: this.user.name,
      color: this.user.color,
      avatarUrl: this.user.avatarUrl,
    });

    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);

    if (options.autoConnect !== false) {
      this.connect();
    }
  }

  get status(): ProviderStatus {
    return this._status;
  }

  get isSynced(): boolean {
    return this.synced;
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  connect(): void {
    if (this._status !== 'disconnected') return;
    this.setStatus('connecting');

    const channelName = 'collab:' + this.projectId + ':' + this.fileId;
    const channel = this.supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel.on(
      'broadcast',
      { event: 'yjs-update' },
      (payload: { payload?: { data?: string } }) => {
        const data = payload?.payload?.data;
        if (!data) return;
        try {
          const update = decodeBase64(data);
          this.localUpdateInProgress = true;
          Y.applyUpdate(this.doc, update);
          this.localUpdateInProgress = false;
        } catch (err) {
          this.localUpdateInProgress = false;
          console.error('[SupabaseYjsProvider] Failed to apply remote update:', err);
        }
      }
    );

    channel.on(
      'broadcast',
      { event: 'yjs-awareness' },
      (payload: { payload?: { data?: string } }) => {
        const data = payload?.payload?.data;
        if (!data) return;
        try {
          const update = decodeBase64(data);
          applyAwarenessUpdate(this.awareness, update, 'remote');
          const states = this.awareness.getStates();
          const peerCount = Array.from(states.keys()).filter(id => id !== this.doc.clientID).length;
          console.log('[SupabaseYjsProvider] Received remote awareness -- ' + peerCount + ' peer(s) now visible');
        } catch (err) {
          console.error('[SupabaseYjsProvider] Failed to apply awareness update:', err);
        }
      }
    );

    channel.on(
      'broadcast',
      { event: 'yjs-sync-request' },
      (payload: { payload?: { clientId?: number } }) => {
        const requestingClientId = payload?.payload?.clientId;
        if (!requestingClientId) return;
        console.log('[SupabaseYjsProvider] Received sync-request from clientID ' + requestingClientId);
        const stateUpdate = Y.encodeStateAsUpdate(this.doc);
        channel.send({
          type: 'broadcast',
          event: 'yjs-sync-response',
          payload: {
            data: encodeBase64(stateUpdate),
            targetClientId: requestingClientId,
          },
        });
        // Re-broadcast our awareness so the new joiner sees us
        const awarenessUpdate = encodeAwarenessUpdate(
          this.awareness,
          [this.doc.clientID]
        );
        channel.send({
          type: 'broadcast',
          event: 'yjs-awareness',
          payload: { data: encodeBase64(awarenessUpdate) },
        });
      }
    );

    channel.on(
      'broadcast',
      { event: 'yjs-sync-response' },
      (payload: { payload?: { data?: string; targetClientId?: number } }) => {
        const data = payload?.payload?.data;
        const targetClientId = payload?.payload?.targetClientId;
        if (targetClientId !== this.doc.clientID) return;
        if (!data) return;
        try {
          const update = decodeBase64(data);
          Y.applyUpdate(this.doc, update);
          this.synced = true;
          console.log('[SupabaseYjsProvider] Applied sync-response, doc synced');
        } catch (err) {
          console.error('[SupabaseYjsProvider] Failed to apply sync response:', err);
        }
      }
    );

    channel.subscribe((status: string) => {
      console.log('[SupabaseYjsProvider] Channel "' + channelName + '" status: ' + status + ' (clientID: ' + this.doc.clientID + ')');
      if (status === 'SUBSCRIBED') {
        this.setStatus('connected');
        channel.send({
          type: 'broadcast',
          event: 'yjs-sync-request',
          payload: { clientId: this.doc.clientID },
        });
        const awarenessUpdate = encodeAwarenessUpdate(
          this.awareness,
          [this.doc.clientID]
        );
        channel.send({
          type: 'broadcast',
          event: 'yjs-awareness',
          payload: { data: encodeBase64(awarenessUpdate) },
        });
        console.log('[SupabaseYjsProvider] Sent initial awareness for clientID ' + this.doc.clientID + ' (user: ' + this.user.name + ')');

        // Periodic awareness heartbeat so late-joining clients always discover us
        if (this.awarenessHeartbeatTimer) clearInterval(this.awarenessHeartbeatTimer);
        this.awarenessHeartbeatTimer = setInterval(() => {
          if (!this.channel) return;
          const heartbeat = encodeAwarenessUpdate(
            this.awareness,
            [this.doc.clientID]
          );
          this.channel.send({
            type: 'broadcast',
            event: 'yjs-awareness',
            payload: { data: encodeBase64(heartbeat) },
          });
        }, 30000);

        setTimeout(() => {
          if (!this.synced) this.synced = true;
        }, 2000);
      }
    });

    this.channel = channel;
  }

  disconnect(): void {
    if (this.awarenessHeartbeatTimer) {
      clearInterval(this.awarenessHeartbeatTimer);
      this.awarenessHeartbeatTimer = null;
    }
    if (this.channel) {
      this.awareness.setLocalState(null);
      this.channel.unsubscribe();
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.pendingUpdate = null;
    this.synced = false;
    this.setStatus('disconnected');
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.destroy();
    this.statusListeners.clear();
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this.localUpdateInProgress) return;
    if (origin === 'y-monaco') return;
    this.queueUpdate(update);
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    _origin: unknown
  ): void => {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length === 0) return;
    if (!changedClients.includes(this.doc.clientID)) return;

    const awarenessUpdate = encodeAwarenessUpdate(this.awareness, changedClients);
    this.channel?.send({
      type: 'broadcast',
      event: 'yjs-awareness',
      payload: { data: encodeBase64(awarenessUpdate) },
    });
  };

  private queueUpdate(update: Uint8Array): void {
    if (this.pendingUpdate) {
      this.pendingUpdate = Y.mergeUpdates([this.pendingUpdate, update]);
    } else {
      this.pendingUpdate = update;
    }

    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.flushUpdate();
    }, this.updateDebounceMs);
  }

  private flushUpdate(): void {
    if (!this.pendingUpdate || !this.channel) return;
    const data = encodeBase64(this.pendingUpdate);
    this.channel.send({
      type: 'broadcast',
      event: 'yjs-update',
      payload: { data },
    });
    this.pendingUpdate = null;
    this.updateTimer = null;
  }

  private setStatus(status: ProviderStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
