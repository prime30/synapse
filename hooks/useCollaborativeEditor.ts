'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Y from 'yjs';
import { SupabaseYjsProvider, type CollaborationUser } from '@/lib/collaboration/yjs-supabase-provider';
import { YjsPersistence } from '@/lib/collaboration/yjs-persistence';

export interface UseCollaborativeEditorOptions {
  projectId: string;
  fileId: string;
  initialContent: string;
  user: CollaborationUser;
  autoSaveMs?: number;
  solo?: boolean;
}

export interface CollaborativePeer {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
  cursor?: { lineNumber: number; column: number } | null;
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
}

type ProviderStatus = 'disconnected' | 'connecting' | 'connected';

interface MonacoEditor {
  getModel(): unknown;
  onDidDispose(fn: () => void): { dispose(): void };
}

export function useCollaborativeEditor(options: UseCollaborativeEditorOptions) {
  const {
    projectId,
    fileId,
    initialContent,
    user,
    autoSaveMs = 3000,
    solo = false,
  } = options;

  const [status, setStatus] = useState<ProviderStatus>('disconnected');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [peers, setPeers] = useState<CollaborativePeer[]>([]);
  const [content, setContent] = useState(initialContent);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SupabaseYjsProvider | null>(null);
  const persistenceRef = useRef<YjsPersistence | null>(null);
  const bindingRef = useRef<{ destroy(): void } | null>(null);
  const currentFileIdRef = useRef(fileId);

  useEffect(() => {
    if (!fileId || !projectId) return;
    // Skip all Yjs initialization when running in solo (non-collaborative) mode.
    // This avoids creating Y.Doc, YjsPersistence, and Supabase channels unnecessarily.
    if (solo) return;

    currentFileIdRef.current = fileId;

    const doc = new Y.Doc();
    docRef.current = doc;

    const persistence = new YjsPersistence(doc, {
      fileId,
      projectId,
      autoSaveMs,
      onSave(savedContent) {
        setIsSaving(false);
        setContent(savedContent);
      },
      onSaveError() {
        setIsSaving(false);
      },
      onDirtyChange(dirty) {
        setIsDirty(dirty);
      },
    });
    persistenceRef.current = persistence;

    persistence.initFromContent(initialContent);
    setContent(initialContent);

    const ytext = doc.getText('monaco');
    const contentObserver = () => {
      if (currentFileIdRef.current === fileId) {
        setContent(ytext.toString());
      }
    };
    ytext.observe(contentObserver);

    let provider: SupabaseYjsProvider | null = null;
    if (!solo) {
      provider = new SupabaseYjsProvider(doc, {
        projectId,
        fileId,
        user,
        autoConnect: true,
      });
      providerRef.current = provider;

      provider.onStatus((s) => {
        if (currentFileIdRef.current === fileId) {
          setStatus(s);
        }
      });

      provider.awareness.on('change', () => {
        if (currentFileIdRef.current !== fileId) return;
        const states = provider!.awareness.getStates();
        const peerList: CollaborativePeer[] = [];

        states.forEach((state, clientId) => {
          if (clientId === doc.clientID) return;
          const u = state.user as CollaborativePeer | undefined;
          if (!u?.userId) return;
          peerList.push({
            userId: u.userId,
            name: u.name,
            color: u.color,
            avatarUrl: u.avatarUrl,
            cursor: (state.cursor as CollaborativePeer['cursor']) ?? null,
            selection: (state.selection as CollaborativePeer['selection']) ?? null,
          });
        });

        console.log('[useCollaborativeEditor] Awareness change: ' + peerList.length + ' peer(s)', peerList.map(p => p.name));
        setPeers(peerList);
      });
    }

    return () => {
      ytext.unobserve(contentObserver);
      bindingRef.current?.destroy();
      bindingRef.current = null;
      provider?.destroy();
      providerRef.current = null;
      persistence.destroy();
      persistenceRef.current = null;
      doc.destroy();
      docRef.current = null;
      setStatus('disconnected');
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, projectId, solo]);

  const bind = useCallback(
    (editor: MonacoEditor) => {
      const doc = docRef.current;
      if (!doc) return;

      bindingRef.current?.destroy();

      import('y-monaco').then(({ MonacoBinding }) => {
        const ytext = doc.getText('monaco');
        const model = editor.getModel();
        if (!model) return;

        const awareness = providerRef.current?.awareness ?? undefined;

        const binding = new MonacoBinding(
          ytext,
          model as import('monaco-editor').editor.ITextModel,
          new Set([editor as import('monaco-editor').editor.IStandaloneCodeEditor]),
          awareness
        );

        bindingRef.current = binding;

        editor.onDidDispose(() => {
          binding.destroy();
          if (bindingRef.current === binding) {
            bindingRef.current = null;
          }
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileId]
  );

  const save = useCallback(async () => {
    const persistence = persistenceRef.current;
    if (!persistence) return;
    setIsSaving(true);
    try {
      await persistence.save();
    } catch {
      // Error handled via callback
    }
  }, []);

  const revert = useCallback(() => {
    persistenceRef.current?.revert();
  }, []);

  const getContent = useCallback((): string => {
    return persistenceRef.current?.currentContent ?? content;
  }, [content]);

  return {
    bind,
    content,
    isDirty,
    isSaving,
    save,
    revert,
    getContent,
    status,
    peers,
    doc: docRef.current,
    provider: providerRef.current,
  };
}
