'use client';

import { useState } from 'react';

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
  const displayName = fileName.length > 20 ? `${fileName.slice(0, 17)}...` : fileName;

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
        group flex items-center gap-1.5 px-3.5 py-2 flex-1 min-w-[100px] max-w-[240px]
        rounded-lg cursor-pointer transition-colors transition-shadow
        ${isActive
          ? 'ide-tab-active ide-text relative z-[1]'
          : 'ide-tab-inactive ide-text-muted'}
        ${isDragOver ? 'ring-2 ring-inset ring-sky-500/50' : ''}
      `}
      onClick={onSelect}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {!icon && isLocked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-400/70">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )}
      <span className="truncate flex-1 text-sm">{displayName}</span>
      {isUnsaved && !isLocked && (
        <span className="text-amber-400 text-xs flex-shrink-0" title="Unsaved">
          •
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded ide-hover ide-text-muted hover:ide-text transition-opacity"
        aria-label="Close tab"
      >
        ×
      </button>
    </div>
  );
}
