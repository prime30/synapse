'use client';

import { useState } from 'react';

interface FileTabProps {
  fileId: string;
  fileName: string;
  isActive: boolean;
  isUnsaved: boolean;
  isLocked?: boolean;
  onSelect: () => void;
  onClose: () => void;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (index: number) => void;
}

export function FileTab({
  fileName,
  isActive,
  isUnsaved,
  isLocked = false,
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
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => { setIsDragOver(false); onDrop(index); }}
      className={`
        group flex items-center gap-1 px-3 py-2 min-w-0 max-w-[150px]
        border-r border-gray-700/50 cursor-pointer
        hover:bg-gray-700/30 transition-colors
        ${isActive ? 'bg-gray-700/50 text-white' : 'bg-gray-800/50 text-gray-400'}
        ${isDragOver ? 'border-l-2 border-l-blue-500' : ''}
      `}
      onClick={onSelect}
    >
      {isLocked && (
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
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-white transition-opacity"
        aria-label="Close tab"
      >
        ×
      </button>
    </div>
  );
}
