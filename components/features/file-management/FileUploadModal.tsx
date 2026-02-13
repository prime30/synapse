'use client';

import { useState } from 'react';
import { CopyPasteUpload } from './CopyPasteUpload';
import { FilePickerUpload } from './FilePickerUpload';

interface FileUploadModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function FileUploadModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: FileUploadModalProps) {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = () => {
    setError(null);
    onSuccess?.();
    onClose();
  };

  const handleError = (message: string) => {
    setError(message);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-lg mx-4 border ide-border">
        <div className="flex items-center justify-between px-4 py-3 border-b ide-border">
          <h2 className="text-lg font-medium ide-text">Add File to Project</h2>
          <button
            type="button"
            onClick={onClose}
            className="ide-text-muted hover:ide-text"
          >
            ×
          </button>
        </div>

        <div className="flex border-b ide-border">
          <button
            type="button"
            onClick={() => setTab('paste')}
            className={`px-4 py-2 text-sm ${tab === 'paste' ? 'border-b-2 border-sky-500 text-sky-500 dark:text-sky-400' : 'ide-text-muted hover:ide-text'}`}
          >
            Copy-Paste
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`px-4 py-2 text-sm ${tab === 'upload' ? 'border-b-2 border-sky-500 text-sky-500 dark:text-sky-400' : 'ide-text-muted hover:ide-text'}`}
          >
            Upload File
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {tab === 'paste' ? (
            <CopyPasteUpload
              projectId={projectId}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          ) : (
            <FilePickerUpload
              projectId={projectId}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
