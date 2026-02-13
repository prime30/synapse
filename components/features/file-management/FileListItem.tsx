'use client';

import { useState, useCallback } from 'react';
import type { FileType } from '@/lib/types/files';
import { formatFileSize, formatRelativeTime } from '@/hooks/useProjectFiles';
import type { ProjectFile } from '@/hooks/useProjectFiles';
import { FileTreePresence } from '@/components/files/FileTreePresence';
import { FileContextMenu } from './FileContextMenu';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

interface FileListItemProps {
  file: ProjectFile;
  onClick: () => void;
  presence?: WorkspacePresence[];
  onCopyPath?: (path: string) => void;
  onDuplicate?: (fileId: string) => void;
  onDelete?: (fileId: string) => void;
  snippetUsageCount?: number;
}

function getFileTypeColor(type: FileType): string {
  switch (type) {
    case 'liquid':
      return 'text-sky-500 dark:text-sky-400';
    case 'javascript':
      return 'text-amber-400';
    case 'css':
      return 'text-purple-400';
    default:
      return 'ide-text-muted';
  }
}

export function FileListItem({
  file,
  onClick,
  presence = [],
  onCopyPath,
  onDuplicate,
  onDelete,
  snippetUsageCount,
}: FileListItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const displayName =
    file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const menuItems = [
    {
      label: 'Copy Path',
      onClick: () => {
        if (onCopyPath) {
          onCopyPath(file.path);
        } else {
          navigator.clipboard.writeText(file.path).catch(() => {});
        }
      },
    },
    ...(onDuplicate
      ? [{ label: 'Duplicate', onClick: () => onDuplicate(file.id) }]
      : []),
    ...(onDelete
      ? [{ label: 'Delete', onClick: () => onDelete(file.id), dangerous: true }]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className="w-full flex items-center gap-2 px-3 py-2 text-left ide-hover rounded transition-colors group"
      >
        <span className={`flex-shrink-0 ${getFileTypeColor(file.file_type)}`}>
          📄
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm ide-text flex items-center">
            {displayName}
            {snippetUsageCount != null && snippetUsageCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium ide-active text-sky-500 dark:text-sky-400 rounded-full leading-none">
                x{snippetUsageCount}
              </span>
            )}
          </div>
          <div className="text-xs ide-text-muted">
            {formatFileSize(file.size_bytes)} • {formatRelativeTime(file.updated_at)}
          </div>
        </div>
        <FileTreePresence filePath={file.path} presence={presence} />
      </button>
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={menuItems}
        />
      )}
    </>
  );
}
