'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFile } from './useFile';
import { useAutoSave } from './useAutoSave';
import { emitPreviewSyncComplete, pollForPushCompletion } from '@/lib/preview/sync-listener';
import { emitFileSaved } from './useThemeHealth';

/**
 * Persist auto-sync preference. The server-side push-queue handles the actual
 * push; this toggle is kept so the UI checkbox in ShopifyConnectPanel still works.
 */
export function setAutoSyncEnabled(projectId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) localStorage.setItem(`synapse-auto-sync-${projectId}`, '1');
    else localStorage.removeItem(`synapse-auto-sync-${projectId}`);
  } catch { /* ignore */ }
}

export function useFileEditor(fileId: string | null) {
  const { file, isLoading, refetch } = useFile(fileId);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');

  const { loadDraft, clearDraft } = useAutoSave(
    fileId,
    content,
    content !== originalContent
  );

  const fileContent = file?.content;
  useEffect(() => {
    if (!fileId) return;

    const draft = loadDraft(fileId);

    if (fileContent !== undefined) {
      const serverContent = fileContent;
      const displayContent = draft ?? serverContent;
      queueMicrotask(() => {
        setOriginalContent(serverContent);
        setContent(displayContent);
      });
    } else if (draft) {
      queueMicrotask(() => {
        setContent(draft);
        setOriginalContent(draft);
      });
    }
  }, [fileId, fileContent, loadDraft]);

  const isDirty = content !== originalContent;

  const save = useCallback(async () => {
    if (!fileId) return;
    const res = await fetch(`/api/files/${fileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Save failed');
    clearDraft(fileId);
    setOriginalContent(content);
    await refetch();

    const projectId = json.data?.project_id;
    if (projectId) emitFileSaved(projectId);

    if (json.data?.shopifyPushQueued && projectId) {
      const saveTs = Date.now();
      pollForPushCompletion(projectId, saveTs).then(() => {
        emitPreviewSyncComplete(projectId);
      });
    }
  }, [fileId, content, clearDraft, refetch]);

  const cancel = useCallback(() => {
    if (!fileId) return;
    clearDraft(fileId);
    setContent(originalContent);
  }, [fileId, originalContent, clearDraft]);

  return {
    content,
    setContent,
    originalContent,
    isDirty,
    isLoading,
    isAutoSyncing: false,
    file,
    save,
    cancel,
  };
}
