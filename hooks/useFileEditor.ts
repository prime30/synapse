'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFile } from './useFile';
import { useAutoSave } from './useAutoSave';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';

/** Check if auto-sync is enabled for a project (stored in localStorage). */
function isAutoSyncEnabled(projectId: string | null): boolean {
  if (!projectId || typeof window === 'undefined') return false;
  try { return localStorage.getItem(`synapse-auto-sync-${projectId}`) === '1'; } catch { return false; }
}

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

  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

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

    if (json.data?.shopifyPushQueued && projectId) {
      setTimeout(() => emitPreviewSyncComplete(projectId), 2000);
    }

    // Auto-sync: debounced push to Shopify after save
    if (projectId && isAutoSyncEnabled(projectId)) {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = setTimeout(async () => {
        try {
          setIsAutoSyncing(true);
          const syncRes = await fetch(`/api/projects/${projectId}/shopify/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'push' }),
          });
          if (syncRes.ok) {
            emitPreviewSyncComplete(projectId);
          }
        } catch { /* non-blocking */ }
        finally { setIsAutoSyncing(false); }
      }, 2000);
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
    isAutoSyncing,
    file,
    save,
    cancel,
  };
}
