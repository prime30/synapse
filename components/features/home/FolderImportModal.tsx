'use client';

import { useState, useRef, useCallback } from 'react';
import { X, FolderOpen, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface FolderImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (projectId: string) => void;
}

const THEME_DIRS = ['layout', 'templates', 'sections', 'snippets', 'config', 'assets'];
const TEXT_EXTS = new Set(['.liquid', '.json', '.css', '.js', '.ts', '.scss', '.svg', '.txt', '.html']);

type ImportState = 'idle' | 'validating' | 'creating' | 'uploading' | 'success' | 'error';

export function FolderImportModal({ isOpen, onClose, onImportSuccess }: FolderImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ uploaded: 0, total: 0 });
  const [folderName, setFolderName] = useState<string | null>(null);

  const supportsDirectory =
    typeof window !== 'undefined' && 'webkitdirectory' in document.createElement('input');

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setProgress({ uploaded: 0, total: 0 });
    setFolderName(null);
  }, []);

  const handleClose = () => {
    if (state === 'uploading' || state === 'creating') return;
    reset();
    onClose();
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setState('validating');

    const firstPath =
      (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const rootFolder = firstPath.split('/')[0] || 'Imported Theme';
    setFolderName(rootFolder);

    const allPaths = Array.from(files).map(
      (f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    );

    let basePath = '';
    const foundDirsAtRoot = THEME_DIRS.filter((d) =>
      allPaths.some((p) => p.startsWith(`${rootFolder}/${d}/`) || p.startsWith(`${d}/`))
    );

    if (foundDirsAtRoot.length < 2) {
      const subfolders = new Set(
        allPaths
          .map((p) => {
            const parts = p.split('/');
            return parts.length > 2 ? parts[1] : '';
          })
          .filter(Boolean)
      );

      for (const sub of subfolders) {
        const foundNested = THEME_DIRS.filter((d) =>
          allPaths.some((p) => p.includes(`${sub}/${d}/`))
        );
        if (foundNested.length >= 2) {
          basePath = `${rootFolder}/${sub}`;
          break;
        }
      }

      if (!basePath && foundDirsAtRoot.length < 2) {
        setState('error');
        setError(
          "This folder doesn't appear to be a Shopify theme. Expected at least 2 of: layout/, templates/, sections/, snippets/, config/, assets/"
        );
        return;
      }
    } else {
      basePath = rootFolder;
    }

    // Create project
    setState('creating');
    let projectId: string;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rootFolder }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to create project');
      }
      const json = await res.json();
      projectId = json.data.id;
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Failed to create project');
      return;
    }

    // Upload files in batches
    setState('uploading');
    const fileList = Array.from(files);
    const themeFiles: { path: string; content: string; encoding?: string }[] = [];

    for (const file of fileList) {
      const relPath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      let themePath = relPath;
      if (basePath && relPath.startsWith(basePath + '/')) {
        themePath = relPath.slice(basePath.length + 1);
      } else if (relPath.startsWith(rootFolder + '/')) {
        themePath = relPath.slice(rootFolder.length + 1);
      }

      if (themePath.startsWith('.') || themePath.includes('/.')) continue;
      if (file.size === 0) continue;

      const ext = '.' + themePath.split('.').pop()?.toLowerCase();
      if (TEXT_EXTS.has(ext)) {
        const text = await file.text();
        themeFiles.push({ path: themePath, content: text });
      } else {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        themeFiles.push({ path: themePath, content: base64, encoding: 'base64' });
      }
    }

    setProgress({ uploaded: 0, total: themeFiles.length });

    const BATCH_SIZE = 20;
    let uploaded = 0;
    for (let i = 0; i < themeFiles.length; i += BATCH_SIZE) {
      const batch = themeFiles.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`/api/projects/${projectId}/files/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: batch }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Upload failed');
        }
      } catch (err) {
        setState('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
        return;
      }
      uploaded += batch.length;
      setProgress({ uploaded, total: themeFiles.length });
    }

    setState('success');
    setTimeout(() => {
      onImportSuccess(projectId);
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative ide-surface-pop rounded-lg shadow-xl w-full max-w-md mx-4 border ide-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b ide-border">
          <h2 className="text-lg font-medium ide-text">Import from Folder</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-800 ide-text-muted hover:ide-text transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!supportsDirectory ? (
            <div className="text-center py-6 space-y-2">
              <AlertCircle size={32} className="mx-auto text-amber-400" />
              <p className="text-sm ide-text">
                Your browser doesn&apos;t support folder selection.
              </p>
              <p className="text-xs ide-text-muted">
                Try Chrome or Edge, or use ZIP upload instead.
              </p>
            </div>
          ) : state === 'idle' ? (
            <div className="text-center py-8 space-y-4">
              <FolderOpen size={48} className="mx-auto text-gray-500" />
              <div className="space-y-1">
                <p className="text-sm ide-text">Select a Shopify theme folder</p>
                <p className="text-xs ide-text-muted">
                  Must contain at least 2 of: layout/, templates/, sections/, snippets/, config/,
                  assets/
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors"
              >
                Choose Folder
              </button>
              <input
                ref={fileInputRef}
                type="file"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...({ webkitdirectory: '', directory: '' } as any)}
                onChange={handleFolderSelect}
                className="hidden"
              />
            </div>
          ) : state === 'validating' ? (
            <div className="text-center py-8 space-y-3">
              <Loader2 size={32} className="mx-auto text-sky-400 animate-spin" />
              <p className="text-sm ide-text">Validating theme structure...</p>
            </div>
          ) : state === 'creating' ? (
            <div className="text-center py-8 space-y-3">
              <Loader2 size={32} className="mx-auto text-sky-400 animate-spin" />
              <p className="text-sm ide-text">
                Creating project &quot;{folderName}&quot;...
              </p>
            </div>
          ) : state === 'uploading' ? (
            <div className="py-6 space-y-4">
              <div className="text-center space-y-2">
                <Loader2 size={32} className="mx-auto text-sky-400 animate-spin" />
                <p className="text-sm ide-text">
                  Uploading files... {progress.uploaded} / {progress.total}
                </p>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-500"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.round((progress.uploaded / progress.total) * 100)}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
          ) : state === 'success' ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 size={32} className="mx-auto text-green-400" />
              <p className="text-sm text-green-400">
                Imported {progress.total} files from &quot;{folderName}&quot;
              </p>
            </div>
          ) : state === 'error' ? (
            <div className="py-6 space-y-4">
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                {error}
              </div>
              <div className="flex justify-center gap-2">
                <button
                  onClick={reset}
                  className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
