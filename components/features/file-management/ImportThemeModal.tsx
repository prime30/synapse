'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useQuery } from '@tanstack/react-query';

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
  development: { label: 'Dev', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: { label: 'Unpublished', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/40' },
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
  const [createDevThemeForPreview, setCreateDevThemeForPreview] = useState(true);
  const [previewNote, setPreviewNote] = useState('');
  const [importProgress, setImportProgress] = useState<'idle' | 'importing'>('idle');
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

  // ── Store theme import (auto-creates project) ───────────────────────────
  const handleStoreImport = async () => {
    if (!selectedThemeId || !connection) return;
    setStoreError(null);
    setImportProgress('importing');

    try {
      const selectedTheme = themesQuery.data?.find((t) => t.id === selectedThemeId);
      const result = await importTheme({
        connectionId: connection.id,
        themeId: selectedThemeId,
        themeName: selectedTheme?.name,
        createDevThemeForPreview,
        note: previewNote.trim() || undefined,
      });

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
      onImportSuccess?.();

      // Navigate to the new project
      setTimeout(() => {
        onClose();
        router.push(`/projects/${result.projectId}`);
      }, 1000);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Import failed');
      setImportProgress('idle');
    }
  };

  if (!isOpen) return null;

  const themes = themesQuery.data ?? [];
  const isLoadingThemes = themesQuery.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4 border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-medium text-gray-200">Import Theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {connection && (
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`px-4 py-2 text-sm ${
                activeTab === 'store'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
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
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Upload ZIP
          </button>
        </div>

        {/* Tab content */}
        <div className="p-4 space-y-4">
          {/* Success banner */}
          {importSuccess && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-sm">
              {importSuccess}
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
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {zipFile ? (
                  <p className="text-sm text-gray-200">{zipFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-400">Drag and drop your theme .zip file here</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="px-4 py-1.5 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
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

              <label className="block text-xs font-medium text-gray-400">
                Select theme to import
              </label>
              <div ref={themeDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => !isLoadingThemes && setThemeDropdownOpen((o) => !o)}
                  disabled={isLoadingThemes}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                >
                  <span className="truncate">
                    {isLoadingThemes
                      ? 'Loading themes...'
                      : selectedThemeId
                        ? themes.find((t) => t.id === selectedThemeId)?.name ?? 'Select a theme'
                        : 'Select a theme'}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`}>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {themeDropdownOpen && themes.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded bg-gray-800 border border-gray-600 shadow-lg">
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
                                ? 'bg-blue-600/20 text-white'
                                : 'text-gray-200 hover:bg-gray-700'
                            }`}
                          >
                            <span className="flex-1 min-w-0 truncate">{theme.name}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.cls}`}>
                              {badge.label}
                            </span>
                            <span className="shrink-0 text-[10px] text-gray-500 tabular-nums">
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
                  className="mt-1 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">
                  Create a development theme for preview (recommended).
                </span>
              </label>

              {createDevThemeForPreview && (
                <div>
                  <label htmlFor="preview-note" className="block text-xs font-medium text-gray-400 mb-1">
                    Preview note (optional)
                  </label>
                  <input
                    id="preview-note"
                    type="text"
                    value={previewNote}
                    onChange={(e) => setPreviewNote(e.target.value)}
                    placeholder="e.g. Import from Live theme"
                    className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              )}

              {importProgress !== 'idle' && (
                <p className="text-sm text-blue-400">
                  Importing theme... (large themes can take a few minutes)
                </p>
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
          <p className="text-xs text-gray-500 mb-3">
            Importing a theme creates a new project automatically.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
          >
            Cancel
          </button>

          {activeTab === 'zip' && (
            <button
              type="button"
              onClick={handleZipImport}
              disabled={!zipFile || isUploading || !projectId}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Importing...' : 'Import Theme'}
            </button>
          )}

          {activeTab === 'store' && (
            <button
              type="button"
              onClick={handleStoreImport}
              disabled={!selectedThemeId || isImporting || importProgress === 'importing'}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importProgress === 'importing' || isImporting ? 'Importing...' : 'Import Theme'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
