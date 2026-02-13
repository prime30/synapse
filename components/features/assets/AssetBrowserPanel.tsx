'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Image,
  File,
  FileCode,
  Upload,
  Trash2,
  Search,
  GripVertical,
  Loader2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { useShopifyAssets, ShopifyAssetInfo } from '@/hooks/useShopifyAssets';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract just the filename from a full asset key like "assets/logo.png" */
function filename(key: string): string {
  return key.split('/').pop() ?? key;
}

/** Human-readable file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get file extension from a key */
function extension(key: string): string {
  const parts = key.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'avif',
]);
const CODE_EXTENSIONS = new Set([
  'css',
  'js',
  'ts',
  'json',
  'liquid',
  'scss',
  'less',
]);

function isImage(key: string): boolean {
  return IMAGE_EXTENSIONS.has(extension(key));
}

function isCode(key: string): boolean {
  return CODE_EXTENSIONS.has(extension(key));
}

/** Pick the right icon for an asset */
function AssetIcon({ assetKey }: { assetKey: string }) {
  if (isImage(assetKey)) {
    // eslint-disable-next-line jsx-a11y/alt-text -- lucide-react SVG icon, not an <img>
    return <Image className="h-5 w-5 text-purple-400" />;
  }
  if (isCode(assetKey)) {
    return <FileCode className="h-5 w-5 text-sky-500 dark:text-sky-400" />;
  }
  return <File className="h-5 w-5 ide-text-muted" />;
}

/**
 * Build a Shopify CDN thumbnail URL for an image asset.
 * Shopify serves theme assets from the CDN at:
 *   https://{store}/cdn/shopify/files/{filename}
 * But the simplest approach is to use the asset_url filter output pattern.
 * For the browser preview we just use a placeholder icon for non-images.
 */
function thumbnailUrl(storeDomain: string | undefined, key: string): string | null {
  if (!storeDomain || !isImage(key)) return null;
  const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
  // Shopify CDN pattern for theme assets
  return `https://${cleanDomain}/cdn/shopify/files/${filename(key)}`;
}

/** Build the Liquid asset reference tag for drag-to-insert */
function liquidAssetRef(key: string): string {
  const name = filename(key);
  const ext = extension(key);

  if (ext === 'css') {
    return `{{ '${name}' | asset_url | stylesheet_tag }}`;
  }
  if (ext === 'js') {
    return `<script src="{{ '${name}' | asset_url }}" defer></script>`;
  }
  // Images and everything else
  return `{{ '${name}' | asset_url }}`;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface AssetBrowserPanelProps {
  connectionId: string;
  themeId: number;
  /** Optional store domain for CDN thumbnail previews */
  storeDomain?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AssetBrowserPanel({
  connectionId,
  themeId,
  storeDomain,
}: AssetBrowserPanelProps) {
  const {
    assets,
    isLoading,
    error,
    upload,
    isUploading,
    deleteAsset,
    isDeleting,
  } = useShopifyAssets(connectionId, themeId);

  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Filtered assets ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter(
      (a) =>
        filename(a.key).toLowerCase().includes(q) ||
        a.content_type.toLowerCase().includes(q)
    );
  }, [assets, search]);

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input?.files?.length) return;

    const file = input.files[0];
    const key = `assets/${file.name}`;

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      try {
        await upload({ key, value: base64 });
      } catch {
        // Error is surfaced through the hook's uploadError state
      }
    };
    reader.readAsDataURL(file);

    // Reset input so re-uploading the same file works
    input.value = '';
  }, [upload]);

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (key: string) => {
      try {
        await deleteAsset(key);
      } catch {
        // Error is surfaced through the hook's deleteError state
      } finally {
        setDeleteConfirm(null);
      }
    },
    [deleteAsset]
  );

  // ── Drag start handler ────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, asset: ShopifyAssetInfo) => {
      const ref = liquidAssetRef(asset.key);
      e.dataTransfer.setData('text/plain', ref);
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center ide-surface-panel">
        <Loader2 className="h-6 w-6 animate-spin ide-text-muted" />
        <span className="ml-2 text-sm ide-text-muted">Loading assets…</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 ide-surface-panel p-4">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-red-300">
          {error instanceof Error ? error.message : 'Failed to load assets'}
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col ide-surface-panel">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b ide-border px-3 py-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 ide-text-muted" />
          <input
            type="text"
            placeholder="Filter assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border ide-border ide-surface-input py-1.5 pl-8 pr-3 text-sm ide-text placeholder-stone-400 dark:placeholder-white/40 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
          <FolderOpen className="h-10 w-10 ide-text-quiet" />
          <p className="text-sm ide-text-muted">
            {search.trim()
              ? 'No assets match your filter.'
              : 'No assets in this theme yet.'}
          </p>
          {!search.trim() && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-sm text-purple-400 hover:text-purple-300"
            >
              Upload your first asset
            </button>
          )}
        </div>
      )}

      {/* ── Asset grid ───────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((asset) => {
              const name = filename(asset.key);
              const thumb = thumbnailUrl(storeDomain, asset.key);
              const isConfirming = deleteConfirm === asset.key;

              return (
                <div
                  key={asset.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset)}
                  className="group relative flex flex-col overflow-hidden rounded-lg border ide-border ide-surface-input transition-colors ide-hover"
                >
                  {/* Drag handle */}
                  <div className="absolute left-1 top-1 cursor-grab opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="h-4 w-4 ide-text-muted" />
                  </div>

                  {/* Preview area */}
                  <div className="flex h-24 items-center justify-center ide-surface-inset p-2">
                    {thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumb}
                        alt={name}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback to icon if CDN image fails
                          (e.target as HTMLImageElement).style.display = 'none';
                          (
                            e.target as HTMLImageElement
                          ).parentElement?.classList.add('fallback-icon');
                        }}
                      />
                    ) : (
                      <AssetIcon assetKey={asset.key} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
                    <span
                      className="truncate text-xs font-medium ide-text"
                      title={name}
                    >
                      {name}
                    </span>
                    <span className="text-[10px] ide-text-muted">
                      {formatSize(asset.size)} · {asset.content_type.split('/').pop()}
                    </span>
                  </div>

                  {/* Delete button */}
                  <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {isConfirming ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(asset.key)}
                          disabled={isDeleting}
                          className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {isDeleting ? '…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded ide-surface-input px-1.5 py-0.5 text-[10px] font-medium ide-text-muted ide-hover"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(asset.key)}
                        className="rounded p-0.5 ide-text-muted hover:bg-red-900/40 hover:text-red-400"
                        title="Delete asset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer status ────────────────────────────────────────────────── */}
      <div className="border-t ide-border px-3 py-1.5 text-[11px] ide-text-muted">
        {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
        {search.trim() && assets.length !== filtered.length && (
          <span> (of {assets.length} total)</span>
        )}
        {' · Drag to insert Liquid reference'}
      </div>
    </div>
  );
}
