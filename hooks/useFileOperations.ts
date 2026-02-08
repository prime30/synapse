'use client';

import { useCallback } from 'react';
import type { FileData } from '@/lib/types/files';

interface UseFileOperationsOptions {
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function useFileOperations(options: UseFileOperationsOptions = {}) {
  const { onError, onSuccess } = options;

  const renameFile = useCallback(
    async (fileId: string, newName: string): Promise<void> => {
      try {
        const res = await fetch(`/api/files/${fileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Rename failed');
        onSuccess?.('File renamed');
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'Rename failed');
        throw e;
      }
    },
    [onError, onSuccess]
  );

  const deleteFile = useCallback(
    async (fileId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? 'Delete failed');
        }
        onSuccess?.('File deleted');
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'Delete failed');
        throw e;
      }
    },
    [onError, onSuccess]
  );

  const duplicateFile = useCallback(
    async (fileId: string): Promise<FileData | null> => {
      try {
        const res = await fetch(`/api/files/${fileId}/duplicate`, {
          method: 'POST',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Duplicate failed');
        onSuccess?.('File duplicated');
        return json.data;
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'Duplicate failed');
        return null;
      }
    },
    [onError, onSuccess]
  );

  const downloadFile = useCallback(
    async (fileId: string, fileName: string): Promise<void> => {
      try {
        const res = await fetch(`/api/files/${fileId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Download failed');
        const content = json.data?.content ?? '';
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        onSuccess?.('File downloaded');
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'Download failed');
        throw e;
      }
    },
    [onError, onSuccess]
  );

  const copyContent = useCallback(
    async (content: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(content);
        onSuccess?.('Copied!');
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'Copy failed');
        throw e;
      }
    },
    [onError, onSuccess]
  );

  return {
    renameFile,
    deleteFile,
    duplicateFile,
    downloadFile,
    copyContent,
  };
}
