'use client';

import { useRouter } from 'next/navigation';
import { FolderOpen, Check, AlertCircle } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { useDesktopImport } from '@/hooks/useDesktopImport';

/**
 * A button that opens a native folder picker (Electron only) and imports
 * a Shopify theme folder as a new Synapse project. Hidden on web.
 */
export function ImportFolderButton({ className }: { className?: string }) {
  const router = useRouter();
  const { status, progress, error, projectId, isAvailable, importFolder, reset } =
    useDesktopImport();

  if (!isAvailable) return null;

  const isWorking = ['selecting', 'reading', 'creating', 'uploading'].includes(status);

  if (status === 'done' && projectId) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <button
          type="button"
          onClick={() => {
            router.push(`/projects/${projectId}`);
            reset();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-accent/10 text-accent px-4 py-2 text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          <Check size={16} />
          {progress} — Open Project
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 text-red-500 px-4 py-2 text-sm">
          <AlertCircle size={16} />
          <span className="max-w-xs truncate">{error}</span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-stone-500 hover:text-stone-700 dark:text-[#636059] dark:hover:text-white/60 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={importFolder}
      disabled={isWorking}
      className={`inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] px-4 py-2 text-sm font-medium text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-[#1e1e1e] transition-colors disabled:opacity-50 ${className ?? ''}`}
    >
      {isWorking ? (
        <>
          <LambdaDots size={16} />
          {progress}
        </>
      ) : (
        <>
          <FolderOpen size={16} />
          Import Folder
        </>
      )}
    </button>
  );
}
