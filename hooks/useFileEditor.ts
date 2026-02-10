'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFile } from './useFile';
import { useAutoSave } from './useAutoSave';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';

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
    if (json.data?.shopifyPushQueued && json.data?.project_id) {
      setTimeout(
        () => emitPreviewSyncComplete(json.data.project_id),
        2000
      );
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
    file,
    save,
    cancel,
  };
}
