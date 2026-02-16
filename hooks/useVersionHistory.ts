'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PREVIEW_TAB_ID } from '@/hooks/useFileTabs';
import type { FileVersion } from '@/lib/types/version';

interface UndoRedoPayload {
  current_version_number: number;
}

interface RestorePayload {
  version_id: string;
  current_version_number: number;
}

interface VersionsResponse {
  data: FileVersion[];
}

interface MutationResponse {
  data: FileVersion;
}

export interface ConflictError {
  status: 409;
  serverVersion: number;
  message: string;
}

function isConflictError(error: unknown): error is ConflictError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as ConflictError).status === 409
  );
}

async function fetchVersions(fileId: string): Promise<FileVersion[]> {
  const res = await fetch(`/api/files/${fileId}/versions`);
  if (!res.ok) throw new Error('Failed to fetch versions');
  const json: VersionsResponse = await res.json();
  return json.data ?? [];
}

async function postUndo(fileId: string, payload: UndoRedoPayload): Promise<FileVersion> {
  const res = await fetch(`/api/files/${fileId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const json = await res.json();
    const err: ConflictError = {
      status: 409,
      serverVersion: json.serverVersion ?? 0,
      message: json.error ?? 'Version conflict',
    };
    throw err;
  }
  if (!res.ok) throw new Error('Undo failed');
  const json: MutationResponse = await res.json();
  return json.data;
}

async function postRedo(fileId: string, payload: UndoRedoPayload): Promise<FileVersion> {
  const res = await fetch(`/api/files/${fileId}/redo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const json = await res.json();
    const err: ConflictError = {
      status: 409,
      serverVersion: json.serverVersion ?? 0,
      message: json.error ?? 'Version conflict',
    };
    throw err;
  }
  if (!res.ok) throw new Error('Redo failed');
  const json: MutationResponse = await res.json();
  return json.data;
}

async function postRestore(fileId: string, payload: RestorePayload): Promise<FileVersion> {
  const res = await fetch(`/api/files/${fileId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const json = await res.json();
    const err: ConflictError = {
      status: 409,
      serverVersion: json.serverVersion ?? 0,
      message: json.error ?? 'Version conflict',
    };
    throw err;
  }
  if (!res.ok) throw new Error('Restore failed');
  const json: MutationResponse = await res.json();
  return json.data;
}

export function useVersionHistory(fileId: string | null) {
  const queryClient = useQueryClient();

  const queryKey = ['file-versions', fileId];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchVersions(fileId!),
    enabled: !!fileId && fileId !== PREVIEW_TAB_ID,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['file', fileId] });
  };

  const undoMutation = useMutation({
    mutationFn: (payload: UndoRedoPayload) => postUndo(fileId!, payload),
    onSuccess: invalidate,
  });

  const redoMutation = useMutation({
    mutationFn: (payload: UndoRedoPayload) => postRedo(fileId!, payload),
    onSuccess: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (payload: RestorePayload) => postRestore(fileId!, payload),
    onSuccess: invalidate,
  });

  const versions = data ?? [];

  return {
    versions,
    isLoading,
    undo: undoMutation.mutateAsync,
    redo: redoMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isUndoing: undoMutation.isPending,
    isRedoing: redoMutation.isPending,
    isRestoring: restoreMutation.isPending,
    undoError: undoMutation.error,
    redoError: redoMutation.error,
    restoreError: restoreMutation.error,
    refetch,
  };
}

export { isConflictError };
