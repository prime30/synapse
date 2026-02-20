'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, GitBranch, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface GitImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (projectId: string) => void;
}

type ImportState = 'idle' | 'cloning' | 'processing' | 'success' | 'error';

const URL_PATTERN = /^(https:\/\/|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$)/;

function extractRepoName(url: string): string {
  const parts = url.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || '';
}

export function GitImportModal({ isOpen, onClose, onImportSuccess }: GitImportModalProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [projectName, setProjectName] = useState('');
  const [autoName, setAutoName] = useState(true);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = URL_PATTERN.test(repoUrl.trim());

  useEffect(() => {
    if (autoName && repoUrl.trim()) {
      const name = extractRepoName(repoUrl.trim());
      if (name) setProjectName(name);
    }
  }, [repoUrl, autoName]);

  const reset = useCallback(() => {
    setRepoUrl('');
    setBranch('');
    setProjectName('');
    setAutoName(true);
    setState('idle');
    setError(null);
  }, []);

  const handleClose = () => {
    if (state === 'cloning' || state === 'processing') return;
    reset();
    onClose();
  };

  const handleImport = async () => {
    if (!isValidUrl) return;
    setError(null);
    setState('cloning');

    try {
      const res = await fetch('/api/projects/import/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || undefined,
          projectName: projectName.trim() || undefined,
        }),
      });

      setState('processing');

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Clone failed');
      }

      const json = await res.json();
      setState('success');

      setTimeout(() => {
        onImportSuccess(json.data.projectId);
      }, 1000);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Import failed');
    }
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
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-sky-400" />
            <h2 className="text-lg font-medium ide-text">Clone from Git</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded ide-hover ide-text-muted hover:ide-text transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {state === 'idle' || state === 'error' ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium ide-text-muted">
                  Repository URL
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-full px-3 py-2 text-sm rounded ide-input pr-8"
                  />
                  {repoUrl.trim() && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      {isValidUrl ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : (
                        <AlertCircle size={16} className="text-red-400" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium ide-text-muted">
                  Branch (optional)
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 text-sm rounded ide-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium ide-text-muted">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    setAutoName(false);
                  }}
                  placeholder="My Theme"
                  className="w-full px-3 py-2 text-sm rounded ide-input"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          ) : state === 'cloning' ? (
            <div className="text-center py-8 space-y-3">
              <Loader2 size={32} className="mx-auto text-sky-400 animate-spin" />
              <p className="text-sm ide-text">Cloning repository...</p>
              <p className="text-xs ide-text-muted">This may take a minute for large repos.</p>
            </div>
          ) : state === 'processing' ? (
            <div className="text-center py-8 space-y-3">
              <Loader2 size={32} className="mx-auto text-sky-400 animate-spin" />
              <p className="text-sm ide-text">Importing files...</p>
            </div>
          ) : state === 'success' ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 size={32} className="mx-auto text-green-400" />
              <p className="text-sm text-green-400">Repository imported successfully!</p>
            </div>
          ) : null}
        </div>

        {(state === 'idle' || state === 'error') && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t ide-border">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!isValidUrl || !repoUrl.trim()}
              className="px-4 py-1.5 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clone &amp; Import
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
