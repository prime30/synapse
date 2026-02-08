'use client';

import type { FileType } from '@/lib/types/files';
import { formatFileSize, formatRelativeTime } from '@/hooks/useProjectFiles';
import type { ProjectFile } from '@/hooks/useProjectFiles';
import { FileTreePresence } from '@/components/files/FileTreePresence';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

interface FileListItemProps {
  file: ProjectFile;
  onClick: () => void;
  presence?: WorkspacePresence[];
}

function getFileTypeColor(type: FileType): string {
  switch (type) {
    case 'liquid':
      return 'text-blue-400';
    case 'javascript':
      return 'text-amber-400';
    case 'css':
      return 'text-purple-400';
    default:
      return 'text-gray-400';
  }
}

export function FileListItem({ file, onClick, presence = [] }: FileListItemProps) {
  const displayName =
    file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700/50 rounded transition-colors group"
    >
      <span className={`flex-shrink-0 ${getFileTypeColor(file.file_type)}`}>
        📄
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-200">{displayName}</div>
        <div className="text-xs text-gray-500">
          {formatFileSize(file.size_bytes)} • {formatRelativeTime(file.updated_at)}
        </div>
      </div>
      <FileTreePresence filePath={file.path} presence={presence} />
    </button>
  );
}
