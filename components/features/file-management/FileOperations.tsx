'use client';

import { useState } from 'react';
import { useFileOperations } from '@/hooks/useFileOperations';
import { FileContextMenu } from './FileContextMenu';

interface FileOperationsProps {
  fileId: string;
  fileName: string;
  fileContent: string;
  projectId?: string;
  onRenameComplete?: () => void;
  onDeleteComplete?: () => void;
  onDuplicateComplete?: (newFileId: string) => void;
  onError?: (message: string) => void;
  children: (props: {
    onContextMenu: (e: React.MouseEvent) => void;
  }) => React.ReactNode;
}

export function FileOperations({
  fileId,
  fileName,
  fileContent,
  projectId,
  onRenameComplete,
  onDeleteComplete,
  onDuplicateComplete,
  onError,
  children,
}: FileOperationsProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [renameValue, setRenameValue] = useState<string | null>(null);

  const ops = useFileOperations({
    projectId,
    onError,
    onSuccess: () => {},
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRename = () => {
    setRenameValue(fileName);
    setMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (!renameValue || renameValue === fileName) {
      setRenameValue(null);
      return;
    }
    try {
      await ops.renameFile(fileId, renameValue);
      onRenameComplete?.();
    } finally {
      setRenameValue(null);
    }
  };

  const handleDelete = () => {
    setDeleteConfirm(true);
    setMenu(null);
  };

  const handleDeleteConfirm = async () => {
    try {
      await ops.deleteFile(fileId);
      onDeleteComplete?.();
    } finally {
      setDeleteConfirm(false);
    }
  };

  const handleDuplicate = async () => {
    const newFile = await ops.duplicateFile(fileId);
    if (newFile) onDuplicateComplete?.(newFile.id);
  };

  const handleDownload = () => ops.downloadFile(fileId, fileName);
  const handleCopyContent = () => ops.copyContent(fileContent);

  return (
    <>
      {children({ onContextMenu: handleContextMenu })}

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: handleRename },
            { label: 'Duplicate', onClick: handleDuplicate },
            { label: 'Download', onClick: handleDownload },
            { label: 'Copy Content', onClick: handleCopyContent },
            { label: 'Delete', onClick: handleDelete, dangerous: true },
          ]}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/60">
          <div className="ide-surface-pop rounded p-4 max-w-sm border ide-border">
            <p className="ide-text mb-4">
              Delete {fileName}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1 ide-text-muted hover:ide-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {renameValue !== null && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/60">
          <div className="ide-surface-pop rounded p-4 max-w-sm border ide-border w-full mx-4">
            <p className="ide-text mb-2">Rename file</p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenameValue(null);
              }}
              className="w-full px-3 py-2 ide-input mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameValue(null)}
                className="px-3 py-1 ide-text-muted hover:ide-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                className="px-3 py-1 bg-sky-600 text-white rounded hover:bg-sky-500"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
