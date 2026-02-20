'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useQuery } from '@tanstack/react-query';

function generateUUID(): string {
  return crypto.randomUUID();
}

interface ImportThemeModalProps {
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

type Tab = 'store' | 'zip';

interface ShopifyTheme {
  id: number;
  name: string;
  role: 'main' | 'unpublished' | 'demo' | 'development';
  updated_at: string;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  main: { label: 'Live', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  development: { label: 'Dev', cls: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: { label: 'Unpublished', cls: 'bg-stone-500/20 ide-text-muted border-stone-500/40' },
};

function themeRelativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ImportThemeModal({
  projectId,
  isOpen,
  onClose,
  onImportSuccess,
}: ImportThemeModalProps) {
  const router = useRouter();
  const { connection, importTheme, isImporting } = useActiveStore();

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(connection ? 'store' : 'zip');

  // ── Upload ZIP state ─────────────────────────────────────────────────────
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── From Store state ─────────────────────────────────────────────────────
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [successProjectId, setSuccessProjectId] = useState<string | null>(null);
  const [createDevThemeForPreview, setCreateDevThemeForPreview] = useState(true);
  const [syncToLocal, setSyncToLocal] = useState(
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1',
  );
  const [previewNote, setPreviewNote] = useState('');
  const [importProgress, setImportProgress] = useState<'idle' | 'importing'>('idle');
  const [totalAssets, setTotalAssets] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    }
    if (themeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [themeDropdownOpen]);

  // ── Themes query ─────────────────────────────────────────────────────────
  const themesQuery = useQuery({
    queryKey: ['store-themes', connection?.id],
    queryFn: async (): Promise<ShopifyTheme[]> => {
      if (!connection) return [];
      const res = await fetch(`/api/stores/${connection.id}/themes`);
      if (!res.ok) throw new Error('Failed to fetch themes');
      const json = await res.json();
      return json.data as ShopifyTheme[];
    },
    enabled: !!connection && activeTab === 'store',
  });

  // ── Drag-and-drop handlers ───────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setZipError(null);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      setZipFile(file);
    } else {
      setZipError('Please drop a .zip file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setZipError(null);
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      setZipFile(file);
    } else if (file) {
      setZipError('Please select a .zip file');
    }
  };

  // ── Upload ZIP import ────────────────────────────────────────────────────
  const handleZipImport = async () => {
    if (!zipFile || !projectId) return;
    setZipError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', zipFile);

      const res = await fetch(`/api/projects/${projectId}/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Upload failed');
      }

      const result = await res.json();
      const count = result.data?.imported ?? 0;
      setImportSuccess(`Imported ${count} file${count !== 1 ? 's' : ''} from ${zipFile.name}`);
      onImportSuccess?.();
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  // ── Store theme import (auto-creates project) ───────────────────────────
  const handleStoreImport = async () => {
    if (!selectedThemeId || !connection) return;
    setStoreError(null);
    setImportProgress('importing');
    setImportedCount(0);
    setTotalAssets(0);

    // 1. Pre-flight: fetch asset count; use text count so bar reaches 100% when text import is done
    let total = 0;
    try {
      const countRes = await fetch(
        `/api/stores/${connection.id}/themes/${selectedThemeId}/asset-count`
      );
      if (countRes.ok) {
        const countJson = await countRes.json();
        total = countJson.data?.text ?? countJson.data?.total ?? 0;
        setTotalAssets(total);
      }
    } catch {
      // Non-critical — progress bar just won't show a total
    }

    // 2. Generate client-side project UUID for immediate polling
    const clientProjectId = generateUUID();

    // 3. Start polling file count (every 1s so progress and completion feel responsive)
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${clientProjectId}/files/count`);
        if (res.ok) {
          const json = await res.json();
          setImportedCount(json.data?.count ?? 0);
        }
      } catch {
        // Polling may fail initially before the project row exists — ignore
      }
    }, 1000);

    // 4. Start the import (blocks until done)
    try {
      const selectedTheme = themesQuery.data?.find((t) => t.id === selectedThemeId);
      const result = await importTheme({
        connectionId: connection.id,
        themeId: selectedThemeId,
        themeName: selectedTheme?.name,
        createDevThemeForPreview,
        syncToLocal,
        note: previewNote.trim() || undefined,
        projectId: clientProjectId,
      });

      // 5. Import done — stop polling, show final count
      stopPolling();
      setImportedCount(result.pulled);

      if (result.errors.length > 0) {
        setImportSuccess(
          `Imported ${result.pulled} files into "${result.projectName}". Some files had errors.`
        );
      } else {
        setImportSuccess(
          `Imported ${result.pulled} file${result.pulled !== 1 ? 's' : ''} into "${result.projectName}".${createDevThemeForPreview ? ' Preview theme is ready.' : ''}`
        );
      }

      setImportProgress('idle');
      setSuccessProjectId(result.projectId);
      onImportSuccess?.();

      // Fire-and-forget thumbnail generation for the new project
      fetch(`/api/projects/${result.projectId}/thumbnail`, { method: 'POST' }).catch(() => {});

      // Navigate to the new project (extended delay so user sees success + design system note)
      setTimeout(() => {
        onClose();
        router.push(`/projects/${result.projectId}`);
      }, 2500);
    } catch (err) {
      stopPolling();
      setStoreError(err instanceof Error ? err.message : 'Import failed');
      setImportProgress('idle');
    }
  };

  if (!isOpen) return null;

  const themes = themesQuery.data ?? [];
  const isLoadingThemes = themesQuery.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center ide-overlay">
      <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-lg mx-4 border ide-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b ide-border">
          <h2 className="text-lg font-medium ide-text">Import Theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="ide-text-muted hover:ide-text transition-colors"
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b ide-border">
          {connection && (
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`px-4 py-2 text-sm ${
                activeTab === 'store'
                  ? 'border-b-2 border-sky-500 text-sky-500 dark:text-sky-400'
                  : 'ide-text-muted hover:ide-text-2'
              }`}
            >
              From Store
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('zip')}
            className={`px-4 py-2 text-sm ${
              activeTab === 'zip'
                ? 'border-b-2 border-sky-500 text-sky-500 dark:text-sky-400'
                : 'ide-text-muted hover:ide-text-2'
            }`}
          >
            Upload ZIP
          </button>
        </div>

        {/* Tab content */}
        <div className="p-4 space-y-4">
          {/* Success banner */}
          {importSuccess && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-sm space-y-2">
              <p>{importSuccess}</p>
              <p className="ide-text-muted text-xs">Design tokens are being extracted in the background.</p>
              {successProjectId && (
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/projects/${successProjectId}/design-system`);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  Open Design System
                </button>
              )}
            </div>
          )}

          {/* Upload ZIP tab */}
          {activeTab === 'zip' && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-sky-500 ide-active'
                    : 'ide-border hover:border-stone-400 ide-surface-panel'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 ide-text-muted">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {zipFile ? (
                  <p className="text-sm ide-text">{zipFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm ide-text-muted">Drag and drop your theme .zip file here</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="px-4 py-1.5 text-sm rounded ide-surface-panel ide-text ide-hover transition-colors"
                    >
                      Browse Files
                    </button>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelect} className="hidden" />
              </div>
              {zipError && (
                <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                  {zipError}
                </div>
              )}
            </>
          )}

          {/* From Store tab */}
          {activeTab === 'store' && connection && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>{connection.store_domain}</span>
              </div>

              <label className="block text-xs font-medium ide-text-muted">
                Select theme to import
              </label>
              <div ref={themeDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => !isLoadingThemes && setThemeDropdownOpen((o) => !o)}
                  disabled={isLoadingThemes}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm rounded ide-input disabled:opacity-50"
                >
                  <span className="truncate">
                    {isLoadingThemes
                      ? 'Loading themes...'
                      : selectedThemeId
                        ? themes.find((t) => t.id === selectedThemeId)?.name ?? 'Select a theme'
                        : 'Select a theme'}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 ide-text-muted transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`}>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {themeDropdownOpen && themes.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded ide-surface-panel border ide-border shadow-lg">
                    {themes.map((theme) => {
                      const badge = ROLE_BADGE[theme.role] ?? ROLE_BADGE.unpublished;
                      const isSelected = theme.id === selectedThemeId;
                      return (
                        <li key={theme.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedThemeId(theme.id);
                              setThemeDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                              isSelected
                                ? 'ide-active ide-text'
                                : 'ide-text ide-hover'
                            }`}
                          >
                            <span className="flex-1 min-w-0 truncate">{theme.name}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.cls}`}>
                              {badge.label}
                            </span>
                            <span className="shrink-0 text-[10px] ide-text-muted tabular-nums">
                              {themeRelativeTime(theme.updated_at)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createDevThemeForPreview}
                  onChange={(e) => setCreateDevThemeForPreview(e.target.checked)}
                  className="mt-1 rounded ide-border ide-surface-input text-sky-500 focus:ring-sky-500"
                />
                <span className="text-sm ide-text-2">
                  Create a development theme for preview (recommended).
                </span>
              </label>

              {createDevThemeForPreview && (
                <div>
                  <label htmlFor="preview-note" className="block text-xs font-medium ide-text-muted mb-1">
                    Preview note (optional)
                  </label>
                  <input
                    id="preview-note"
                    type="text"
                    value={previewNote}
                    onChange={(e) => setPreviewNote(e.target.value)}
                    placeholder="e.g. Import from Live theme"
                    className="w-full px-3 py-2 text-sm rounded ide-input"
                  />
                </div>
              )}

              {process.env.NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1' && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToLocal}
                    onChange={(e) => setSyncToLocal(e.target.checked)}
                    className="mt-1 rounded ide-border ide-surface-input text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-sm ide-text-2">
                    Sync to local filesystem for editing in your IDE.
                    <span className="block text-xs ide-text-muted mt-0.5">
                      Files are pulled to <code className="text-[10px] px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5">.synapse-themes/</code> and changes auto-push to the dev theme.
                    </span>
                  </span>
                </label>
              )}

              {importProgress !== 'idle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-sky-500 dark:text-sky-400">
                      Importing{totalAssets > 0 ? ` ${importedCount} of ${totalAssets} files` : '...'}
                    </span>
                    {totalAssets > 0 && (
                      <span className="ide-text-muted text-xs tabular-nums">
                        {Math.round((importedCount / totalAssets) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 rounded-full ide-surface-inset overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-700 ease-out"
                      style={{
                        width: totalAssets > 0
                          ? `${Math.min(100, (importedCount / totalAssets) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <p className="text-xs ide-text-muted">
                    {totalAssets > 0 && importedCount === 0
                      ? 'Downloading first files from Shopify…'
                      : 'Large themes can take a few minutes.'}
                  </p>
                </div>
              )}

              {storeError && (
                <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                  {storeError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3">
          <p className="text-xs ide-text-muted mb-3">
            Importing a theme creates a new project automatically.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t ide-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors"
          >
            Cancel
          </button>

          {activeTab === 'zip' && (
            <button
              type="button"
              onClick={handleZipImport}
              disabled={!zipFile || isUploading || !projectId}
              className="px-4 py-1.5 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Importing...' : 'Import Theme'}
            </button>
          )}

          {activeTab === 'store' && (
            <button
              type="button"
              onClick={handleStoreImport}
              disabled={!selectedThemeId || isImporting || importProgress === 'importing'}
              className="px-4 py-1.5 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importProgress === 'importing' || isImporting ? 'Importing...' : 'Import Theme'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
