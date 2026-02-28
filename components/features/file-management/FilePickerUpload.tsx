'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileWithContent {
  file: File;
  content: string;
  error?: string;
}

interface FilePickerUploadProps {
  projectId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED = {
  'text/html': ['.liquid'],
  'application/javascript': ['.js', '.ts'],
  'text/css': ['.css', '.scss'],
  'text/plain': ['.liquid', '.js', '.ts', '.css', '.scss'],
};

export function FilePickerUpload({
  projectId,
  onSuccess,
  onError,
}: FilePickerUploadProps) {
  const [selected, setSelected] = useState<FileWithContent[]>([]);
  const [uploading, setUploading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    multiple: true,
    onDrop: async (acceptedFiles) => {
      const items: FileWithContent[] = [];
      for (const file of acceptedFiles) {
        try {
          const content = await file.text();
          items.push({ file, content });
        } catch {
          items.push({
            file,
            content: '',
            error: 'Failed to read file',
          });
        }
      }
      setSelected((prev) => [...prev, ...items]);
    },
  });

  const remove = (index: number) => {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  };

  const upload = async () => {
    if (selected.length === 0) return;
    setUploading(true);

    const files = selected
      .filter((s) => !s.error)
      .map((s) => ({ name: s.file.name, content: s.content }));

    try {
      const res = await fetch(`/api/projects/${projectId}/files/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });

      const json = await res.json();

      if (!res.ok) {
        onError(json.error ?? 'Upload failed');
        setUploading(false);
        return;
      }

      const { data } = json;
      const errors = data?.errors ?? [];
      const successCount = data?.files?.length ?? 0;

      if (errors.length > 0) {
        onError(errors.map((e: { name: string; error: string }) => `${e.name}: ${e.error}`).join('; '));
      }
      if (successCount > 0) {
        setSelected([]);
        onSuccess();
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-sky-500 ide-active' : 'ide-border hover:border-stone-400 dark:hover:border-[#333333]'
        }`}
      >
        <input {...getInputProps()} />
        <p className="ide-text-muted">
          {isDragActive
            ? 'Drop files here...'
            : 'Drag & drop files, or click to select'}
        </p>
        <p className="text-xs ide-text-muted mt-1">
          .liquid, .js, .ts, .css, .scss • max 10MB each
        </p>
      </div>

      {selected.length > 0 && (
        <>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selected.map((s, i) => (
              <div
                key={`${s.file.name}-${i}`}
                className="flex items-center justify-between py-1 px-2 ide-surface-panel rounded"
              >
                <span className="text-sm ide-text truncate flex-1">
                  {s.file.name}
                  {s.error && <span className="text-red-400 ml-1">({s.error})</span>}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-red-400 hover:text-red-300 text-sm ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={upload}
            disabled={uploading || selected.every((s) => s.error)}
            className="w-full px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : `Upload ${selected.length} file(s)`}
          </button>
        </>
      )}
    </div>
  );
}
