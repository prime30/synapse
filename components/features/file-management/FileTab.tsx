'use client';

import { useState, useMemo } from 'react';

const FILE_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  liquid: { label: 'LIQ', color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10' },
  js:     { label: 'JS',  color: 'text-amber-500 dark:text-amber-400 bg-amber-500/10' },
  css:    { label: 'CSS', color: 'text-sky-500 dark:text-sky-400 bg-sky-500/10' },
  scss:   { label: 'CSS', color: 'text-sky-500 dark:text-sky-400 bg-sky-500/10' },
  json:   { label: 'JSON', color: 'text-orange-500 dark:text-orange-400 bg-orange-500/10' },
  ts:     { label: 'TS',  color: 'text-blue-500 dark:text-blue-400 bg-blue-500/10' },
  svg:    { label: 'SVG', color: 'text-pink-500 dark:text-pink-400 bg-pink-500/10' },
};

function getTypeBadge(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPE_BADGE[ext] ?? null;
}

interface FileTabProps {
  fileId: string;
  fileName: string;
  isActive: boolean;
  isUnsaved: boolean;
  isLocked?: boolean;
  /** Optional custom icon (React node) rendered before the filename */
  icon?: React.ReactNode;
  /** Pinned tabs cannot be dragged and show a subtle visual distinction */
  pinned?: boolean;
  onSelect: () => void;
  onClose: () => void;
  index: number;
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
}

export function FileTab({
  fileName,
  isActive,
  isUnsaved,
  isLocked = false,
  icon,
  pinned = false,
  onSelect,
  onClose,
  index,
  onDragStart,
  onDragOver,
  onDrop,
}: FileTabProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const badge = useMemo(() => getTypeBadge(fileName), [fileName]);

  return (
    <div
      role="tab"
      aria-selected={isActive}
      draggable={!pinned}
      onDragStart={pinned || !onDragStart ? undefined : () => onDragStart(index)}
      onDragOver={pinned || !onDragOver ? undefined : (e) => { e.preventDefault(); onDragOver(e); }}
      onDragEnter={pinned ? undefined : () => setIsDragOver(true)}
      onDragLeave={pinned ? undefined : () => setIsDragOver(false)}
      onDrop={pinned || !onDrop ? undefined : () => { setIsDragOver(false); onDrop(index); }}
      className={`
        group/tab relative flex items-center gap-1.5 px-3.5 py-2 min-w-[120px] max-w-[220px]
        rounded-lg cursor-pointer transition-colors transition-shadow
        ${isActive
          ? 'ide-tab-active ide-text relative z-[1]'
          : 'ide-tab-inactive ide-text-muted'}
        ${isDragOver ? 'ring-2 ring-inset ring-sky-500/50' : ''}
      `}
      onClick={onSelect}
    >
      {/* Instant tooltip */}
      <span
        className="
          pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5
          whitespace-nowrap rounded-md px-2.5 py-1
          text-[11px] font-medium
          bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900
          shadow-lg shadow-black/20 dark:shadow-black/40
          opacity-0 scale-95 group-hover/tab:opacity-100 group-hover/tab:scale-100
          transition-[opacity,transform] duration-100
          z-50
          after:absolute after:left-1/2 after:-translate-x-1/2 after:top-full
          after:border-4 after:border-transparent after:border-t-stone-900 dark:after:border-t-stone-100
        "
      >
        {fileName}
      </span>

      {icon && <span className="flex-shrink-0">{icon}</span>}
      {!icon && badge && (
        <span className={`flex-shrink-0 text-[9px] font-bold leading-none tracking-wide rounded px-1 py-0.5 ${badge.color}`}>
          {badge.label}
        </span>
      )}
      {!icon && !badge && isLocked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-400/70">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )}
      <span className="truncate flex-1 text-sm">{fileName}</span>
      {isUnsaved && !isLocked && (
        <span className="text-amber-400 text-xs flex-shrink-0">
          •
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover/tab:opacity-100 p-0.5 rounded ide-hover ide-text-muted hover:ide-text transition-opacity"
        aria-label="Close tab"
      >
        ×
      </button>
    </div>
  );
}
