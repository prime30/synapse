'use client';

import { useCallback } from 'react';
import { ImageIcon } from 'lucide-react';
import { useShopifyFiles } from '@/hooks/useShopifyFiles';

// ── Types ─────────────────────────────────────────────────────────────

interface FilesPanelProps {
  connectionId: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-3 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="aspect-square ide-surface-inset rounded-lg" />
          <div className="h-3 ide-surface-inset rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'READY'
      ? 'text-green-400 bg-green-400/10'
      : status === 'PROCESSING' || status === 'UPLOADED'
        ? 'text-yellow-400 bg-yellow-400/10'
        : 'ide-text-muted bg-stone-200/50 dark:bg-white/10';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${color}`}>
      {status.toLowerCase()}
    </span>
  );
}

// ── File card ─────────────────────────────────────────────────────────

function FileCard({
  file,
  onDelete,
}: {
  file: {
    id: string;
    alt: string | null;
    fileStatus: string;
    preview?: { image?: { url: string } };
    url?: string;
    mimeType?: string;
  };
  onDelete: (id: string) => void;
}) {
  const imageUrl = file.preview?.image?.url || file.url;

  return (
    <div className="group relative rounded-lg border ide-border ide-surface-panel overflow-hidden ide-hover transition-colors">
      {/* Thumbnail */}
      <div className="aspect-square ide-surface-panel flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={file.alt || 'File preview'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ide-text-quiet"
          >
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="px-2 py-2 space-y-1">
        <StatusBadge status={file.fileStatus} />
        {file.alt && (
          <p className="text-[10px] ide-text-muted truncate" title={file.alt}>
            {file.alt}
          </p>
        )}
      </div>

      {/* Delete overlay */}
      <button
        type="button"
        onClick={() => onDelete(file.id)}
        className="absolute top-1.5 right-1.5 p-1 rounded ide-surface-pop ide-text-muted hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete file"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function FilesPanel({ connectionId }: FilesPanelProps) {
  const { files, pageInfo, isLoading, error, refetch, deleteFiles } =
    useShopifyFiles(connectionId);

  const handleDelete = useCallback(
    (fileId: string) => {
      deleteFiles([fileId]);
    },
    [deleteFiles],
  );

  const handleLoadMore = useCallback(() => {
    if (pageInfo.endCursor) {
      refetch(pageInfo.endCursor);
    }
  }, [pageInfo.endCursor, refetch]);

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading && files.length === 0) {
    return <SkeletonGrid />;
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400 mb-2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm text-red-400 mb-1">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs ide-text-muted hover:ide-text underline transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <ImageIcon className="h-7 w-7 mb-2 ide-text-muted" aria-hidden />
        <p className="text-sm ide-text-muted font-medium">No files</p>
        <p className="text-[11px] ide-text-quiet mt-1 max-w-[240px]">
          Upload files in Shopify Admin to see them here.
        </p>
      </div>
    );
  }

  // ── File grid ───────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <span className="text-[11px] ide-text-muted">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          className="px-2.5 py-1 text-[11px] font-medium rounded-md ide-input ide-text-muted cursor-not-allowed opacity-50"
          disabled
          title="File upload coming soon"
        >
          Upload
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-3 p-3">
        {files.map((file) => (
          <FileCard key={file.id} file={file} onDelete={handleDelete} />
        ))}
      </div>

      {/* Load more */}
      {pageInfo.hasNextPage && (
        <div className="flex justify-center pb-3">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="px-4 py-1.5 text-xs font-medium rounded-md ide-surface-panel ide-text ide-hover border ide-border transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
