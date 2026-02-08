'use client';

import { useFile } from '@/hooks/useFile';
import { SyntaxHighlighter } from './SyntaxHighlighter';
import type { FileType } from '@/lib/types/files';

interface FileViewerProps {
  fileId: string | null;
  onEdit?: () => void;
  onCopy?: () => void;
}

export function FileViewer({ fileId, onEdit, onCopy }: FileViewerProps) {
  const { file, isLoading, error, refetch } = useFile(fileId);

  const handleCopy = async () => {
    if (!file?.content) return;
    try {
      await navigator.clipboard.writeText(file.content);
      onCopy?.();
    } catch {
      // Ignore
    }
  };

  if (!fileId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Select a file
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="p-4">
        <p className="text-red-400 mb-2">Failed to load file</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-blue-400 text-sm hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full">
      <div className="flex items-center justify-end gap-2 p-2 border-b border-gray-700 bg-gray-900/50">
        <button
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 text-sm text-gray-400 hover:text-white"
        >
          Copy
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 text-sm text-blue-400 hover:text-blue-300"
          >
            Edit
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          code={file.content}
          language={(file.file_type as FileType) ?? 'other'}
        />
      </div>
    </div>
  );
}
