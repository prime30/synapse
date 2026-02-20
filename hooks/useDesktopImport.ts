'use client';

import { useState, useCallback } from 'react';

type ImportStatus = 'idle' | 'selecting' | 'reading' | 'creating' | 'uploading' | 'done' | 'error';

interface ImportState {
  status: ImportStatus;
  progress: string;
  error: string | null;
  projectId: string | null;
  fileCount: number;
}

/**
 * Hook for importing a local Shopify theme folder into Synapse via the Electron IPC bridge.
 * Returns a no-op on web (non-Electron) environments.
 */
export function useDesktopImport() {
  const [state, setState] = useState<ImportState>({
    status: 'idle',
    progress: '',
    error: null,
    projectId: null,
    fileCount: 0,
  });

  const isAvailable = typeof window !== 'undefined' && !!window.electron?.isDesktop;

  const importFolder = useCallback(async () => {
    if (!window.electron) return;

    setState({ status: 'selecting', progress: 'Choose a folder...', error: null, projectId: null, fileCount: 0 });

    try {
      const folderPath = await window.electron.openFolder();
      if (!folderPath) {
        setState((s) => ({ ...s, status: 'idle', progress: '' }));
        return;
      }

      setState((s) => ({ ...s, status: 'reading', progress: 'Reading theme files...' }));

      const result = await window.electron.readThemeFolder(folderPath);
      if (result.error) {
        setState((s) => ({ ...s, status: 'error', error: result.error, progress: '' }));
        return;
      }

      if (result.files.length === 0) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'No theme files found in the selected folder.',
          progress: '',
        }));
        return;
      }

      const folderName = result.folderName ?? 'Imported Theme';
      setState((s) => ({
        ...s,
        status: 'creating',
        progress: `Creating project "${folderName}"...`,
        fileCount: result.files.length,
      }));

      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: 'Failed to create project' }));
        throw new Error(err.error?.message ?? err.error ?? 'Failed to create project');
      }

      const project = await createRes.json();
      const projectId: string = project.data?.id ?? project.id;

      setState((s) => ({
        ...s,
        status: 'uploading',
        progress: `Uploading ${result.files.length} files...`,
        projectId,
      }));

      const BATCH_SIZE = 20;
      let uploaded = 0;

      for (let i = 0; i < result.files.length; i += BATCH_SIZE) {
        const batch = result.files.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (file) => {
            const res = await fetch(`/api/projects/${projectId}/files`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: file.path,
                content: file.content,
              }),
            });
            if (!res.ok) {
              console.warn(`Failed to upload ${file.path}`);
            }
          }),
        );

        uploaded += batch.length;
        setState((s) => ({
          ...s,
          progress: `Uploading files... (${uploaded}/${result.files.length})`,
        }));
      }

      setState({
        status: 'done',
        progress: `Imported ${uploaded} files`,
        error: null,
        projectId,
        fileCount: uploaded,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
        progress: '',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: '', error: null, projectId: null, fileCount: 0 });
  }, []);

  return { ...state, isAvailable, importFolder, reset };
}
