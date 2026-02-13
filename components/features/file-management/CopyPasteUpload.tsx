'use client';

import { useForm } from 'react-hook-form';
import { detectFileTypeFromName } from '@/lib/types/files';

interface CopyPasteForm {
  name: string;
  content: string;
}

interface CopyPasteUploadProps {
  projectId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getTypeLabel(type: string): string {
  switch (type) {
    case 'liquid':
      return 'Liquid Template';
    case 'javascript':
      return 'JavaScript';
    case 'css':
      return 'CSS';
    default:
      return 'Other';
  }
}

export function CopyPasteUpload({
  projectId,
  onSuccess,
  onError,
}: CopyPasteUploadProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CopyPasteForm>();

  const name = watch('name', '');
  const content = watch('content', '');
  const detectedType = name ? detectFileTypeFromName(name) : null;
  const sizeBytes = content ? new TextEncoder().encode(content).length : 0;
  const sizeOk = sizeBytes <= MAX_SIZE;

  const onSubmit = async (data: CopyPasteForm) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          content: data.content,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        onError(json.error ?? 'Upload failed');
        return;
      }

      onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium ide-text-2 mb-1">
          File Name
        </label>
        <input
          {...register('name', {
            required: 'File name is required',
            maxLength: { value: 255, message: 'Max 255 characters' },
            validate: (v) =>
              v.includes('.') || 'File name must include extension',
          })}
          className="w-full px-3 py-2 ide-input"
          placeholder="product.liquid"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium ide-text-2 mb-1">
          Content
        </label>
        <textarea
          {...register('content', {
            required: 'Content is required',
            validate: (v) => {
              if (!v) return 'Content is required';
              const bytes = new TextEncoder().encode(v).length;
              if (bytes > MAX_SIZE) return 'File exceeds 10MB limit';
              return true;
            },
          })}
          rows={12}
          className="w-full px-3 py-2 ide-input font-mono text-sm"
          placeholder="Paste your file content here..."
        />
        {errors.content && (
          <p className="mt-1 text-sm text-red-400">{errors.content.message}</p>
        )}
      </div>

      {detectedType && (
        <p className="text-sm ide-text-muted">
          Detected Type: {getTypeLabel(detectedType)}
        </p>
      )}
      {content && (
        <p className={`text-sm ${sizeOk ? 'ide-text-muted' : 'text-red-400'}`}>
          Size: {(sizeBytes / 1024).toFixed(1)} KB
          {!sizeOk && ' (exceeds 10MB)'}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !sizeOk}
        className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Adding...' : 'Add File'}
      </button>
    </form>
  );
}
