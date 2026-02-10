'use client';

import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';

interface ImportThemeModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

type Tab = 'zip' | 'store';
type StoreStep = 'connect' | 'select-theme';

export function ImportThemeModal({
  projectId,
  isOpen,
  onClose,
  onImportSuccess,
}: ImportThemeModalProps) {
  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('zip');

  // ── Upload ZIP state ─────────────────────────────────────────────────────
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── From Store state ─────────────────────────────────────────────────────
  const [storeDomain, setStoreDomain] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  const [storeStep, setStoreStep] = useState<StoreStep>('connect');
  const [storeError, setStoreError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [createDevThemeForPreview, setCreateDevThemeForPreview] = useState(true);
  const [previewNote, setPreviewNote] = useState('');
  const [importProgress, setImportProgress] = useState<'idle' | 'pull' | 'setup'>('idle');
  const queryClient = useQueryClient();

  const {
    connected,
    connectManual,
    isConnecting,
    connectError,
    themes,
    isLoadingThemes,
    sync,
    isSyncing,
    syncResult,
  } = useShopifyConnection(projectId);

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
    if (!zipFile) return;
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

  // ── Store connect ────────────────────────────────────────────────────────
  const handleStoreConnect = async () => {
    const domain = storeDomain.trim();
    if (!domain) return;

    setStoreError(null);
    const fullDomain = domain.includes('.myshopify.com')
      ? domain
      : `${domain}.myshopify.com`;

    try {
      await connectManual({
        storeDomain: fullDomain,
        adminApiToken: adminToken.trim(),
      });
      setStoreStep('select-theme');
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  // ── Store theme import ───────────────────────────────────────────────────
  const handleStoreImport = async () => {
    if (!selectedThemeId) return;
    setStoreError(null);
    setImportProgress('pull');
    // #region agent log H5
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H5',location:'components/features/file-management/ImportThemeModal.tsx:152',message:'store import started',data:{projectId,selectedThemeId,createDevThemeForPreview},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    try {
      const result = await sync({ action: 'pull', themeId: selectedThemeId });
      // #region agent log H5
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H5',location:'components/features/file-management/ImportThemeModal.tsx:158',message:'store import pull result',data:{projectId,selectedThemeId,pulled:result.pulled,pushed:result.pushed,errorsCount:result.errors.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (createDevThemeForPreview) {
        setImportProgress('setup');
        try {
          const setupRes = await fetch(
            `/api/projects/${projectId}/shopify/setup-preview-theme`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                note: previewNote.trim() || undefined,
              }),
            }
          );
          const setupJson = await setupRes.json().catch(() => ({}));
          const data = setupJson.data ?? setupJson;

          if (!setupRes.ok) {
            setStoreError(
              setupJson.error ?? data?.message ?? 'Preview setup failed'
            );
            setImportProgress('idle');
            return;
          }
          if (data?.errors?.length) {
            setImportSuccess(
              `Imported ${result.pulled} files. Preview theme is ready. Some files had errors: ${data.errors.slice(0, 3).join(', ')}${data.errors.length > 3 ? '…' : ''}`
            );
          } else {
            setImportSuccess(
              `Imported ${result.pulled} file${result.pulled !== 1 ? 's' : ''}. Preview theme is ready. Only your preview theme was updated; your live store is not affected.`
            );
          }
        } catch (setupErr) {
          setStoreError(
            setupErr instanceof Error ? setupErr.message : 'Preview setup failed'
          );
          setImportProgress('idle');
          return;
        }
      } else {
        setImportSuccess(
          `Successfully pulled ${result.pulled} file${result.pulled !== 1 ? 's' : ''} from Shopify`
        );
      }

      setImportProgress('idle');
      await queryClient.invalidateQueries({ queryKey: ['shopify-connection', projectId] });
      onImportSuccess?.();
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Import failed');
      setImportProgress('idle');
    }
  };

  const handleRetrySetupPreview = async () => {
    setStoreError(null);
    setImportProgress('setup');
    try {
      const setupRes = await fetch(
        `/api/projects/${projectId}/shopify/setup-preview-theme`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: previewNote.trim() || undefined }),
        }
      );
      const setupJson = await setupRes.json().catch(() => ({}));
      if (!setupRes.ok) {
        setStoreError(setupJson.error ?? 'Preview setup failed');
        setImportProgress('idle');
        return;
      }
      setImportSuccess('Preview theme is ready.');
      setImportProgress('idle');
      await queryClient.invalidateQueries({ queryKey: ['shopify-connection', projectId] });
      onImportSuccess?.();
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Preview setup failed');
      setImportProgress('idle');
    }
  };

  // Move to theme selection if already connected
  const effectiveStep =
    activeTab === 'store' && connected ? 'select-theme' : storeStep;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4 border border-gray-700">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-medium text-gray-200">Import Theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-700">
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
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        <div className="p-4 space-y-4">
          {/* Success banner */}
          {importSuccess && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-sm">
              {importSuccess}
            </div>
          )}

          {/* ── Upload ZIP tab ────────────────────────────────────────────── */}
          {activeTab === 'zip' && (
            <>
              {/* Drop zone */}
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
                {/* Upload icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-10 h-10 text-gray-500"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>

                {zipFile ? (
                  <p className="text-sm text-gray-200">{zipFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-400">
                      Drag and drop your theme .zip file here
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-4 py-1.5 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                    >
                      Browse Files
                    </button>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {zipError && (
                <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                  {zipError}
                </div>
              )}
            </>
          )}

          {/* ── From Store tab ────────────────────────────────────────────── */}
          {activeTab === 'store' && (
            <>
              {/* Step 1: Connect */}
              {effectiveStep === 'connect' && (
                <div className="space-y-3">
                  <label
                    htmlFor="store-domain"
                    className="block text-xs font-medium text-gray-400"
                  >
                    Store domain
                  </label>
                  <input
                    id="store-domain"
                    type="text"
                    value={storeDomain}
                    onChange={(e) => setStoreDomain(e.target.value)}
                    placeholder="store-name.myshopify.com"
                    className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />

                  <label
                    htmlFor="admin-token"
                    className="block text-xs font-medium text-gray-400"
                  >
                    Admin API access token
                  </label>
                  <input
                    id="admin-token"
                    type="password"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && handleStoreConnect()
                    }
                    placeholder="shpat_..."
                    className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />

                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Create a token in your Shopify admin:{' '}
                    <span className="text-gray-400">Settings &rarr; Apps &rarr; Develop apps &rarr; Create app &rarr; Configure Admin API scopes</span>.
                    Enable <span className="text-gray-300">read_themes</span> and <span className="text-gray-300">write_themes</span>, then install the app and copy the Admin API access token.
                  </p>

                  <button
                    type="button"
                    onClick={handleStoreConnect}
                    disabled={!storeDomain.trim() || !adminToken.trim() || isConnecting}
                    className="w-full px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConnecting ? 'Connecting…' : 'Connect Store'}
                  </button>

                  {(storeError || connectError) && (
                    <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                      {storeError ?? connectError?.message}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Select theme */}
              {effectiveStep === 'select-theme' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Store connected</span>
                  </div>

                  <label
                    htmlFor="theme-select"
                    className="block text-xs font-medium text-gray-400"
                  >
                    Select theme to import
                  </label>
                  <select
                    id="theme-select"
                    value={selectedThemeId ?? ''}
                    onChange={(e) =>
                      setSelectedThemeId(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    disabled={isLoadingThemes}
                    className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                  >
                    <option value="">
                      {isLoadingThemes
                        ? 'Loading themes…'
                        : 'Select a theme'}
                    </option>
                    {themes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                        {theme.role === 'main' ? ' (Live)' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Create dev theme for preview (From Store only) */}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createDevThemeForPreview}
                      onChange={(e) => setCreateDevThemeForPreview(e.target.checked)}
                      className="mt-1 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">
                      Create a development theme for preview (recommended). Only your preview theme will be updated; your live store is not affected.
                    </span>
                  </label>
                  {createDevThemeForPreview && (
                    <div>
                      <label
                        htmlFor="preview-note"
                        className="block text-xs font-medium text-gray-400 mb-1"
                      >
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

                  {/* Two-step progress */}
                  {importProgress !== 'idle' && (
                    <p className="text-sm text-blue-400">
                      {importProgress === 'pull'
                        ? '1. Importing theme… (large themes can take a few minutes)'
                        : '2. Setting up preview theme…'}
                    </p>
                  )}

                  {/* Sync result feedback */}
                  {syncResult && (
                    <div className="text-xs p-3 rounded bg-gray-800 border border-gray-700 space-y-1">
                      <p className="text-gray-300">
                        Pulled: {syncResult.pulled} &middot; Pushed:{' '}
                        {syncResult.pushed}
                      </p>
                      {syncResult.conflicts.length > 0 && (
                        <p className="text-yellow-400">
                          Conflicts: {syncResult.conflicts.join(', ')}
                        </p>
                      )}
                      {syncResult.errors.length > 0 && (
                        <p className="text-red-400">
                          Errors: {syncResult.errors.join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  {storeError && (
                    <div className="space-y-2">
                      <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                        {storeError}
                      </div>
                      {importProgress === 'idle' && createDevThemeForPreview && (
                        <button
                          type="button"
                          onClick={handleRetrySetupPreview}
                          className="px-3 py-1.5 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                        >
                          Retry setup preview
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 mb-3">
            Supported structure: assets/, config/, layout/, locales/, sections/,
            snippets/, templates/
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
              disabled={!zipFile || isUploading}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Importing…' : 'Import Theme'}
            </button>
          )}

          {activeTab === 'store' && effectiveStep === 'select-theme' && (
            <button
              type="button"
              onClick={handleStoreImport}
              disabled={
                !selectedThemeId ||
                isSyncing ||
                importProgress === 'pull' ||
                importProgress === 'setup'
              }
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importProgress === 'pull'
                ? 'Importing…'
                : importProgress === 'setup'
                  ? 'Setting up preview…'
                  : isSyncing
                    ? 'Importing…'
                    : 'Import Theme'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
