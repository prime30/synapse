'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { isDesktop } from '@/lib/utils/environment';

interface UpdateInfo {
  version: string;
  releaseNotes: string;
}

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready';

export function UpdateToast() {
  const [state, setState] = useState<UpdateState>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;

    const removeAvailable = window.electron.on(
      'app:update-available',
      (payload: UpdateInfo) => {
        setInfo(payload);
        setState('available');
      },
    );

    const removeDownloaded = window.electron.on('app:update-downloaded', () => {
      setState('ready');
    });

    return () => {
      removeAvailable();
      removeDownloaded();
    };
  }, []);

  if (state === 'idle' || !info) return null;

  const handleDownload = async () => {
    setState('downloading');
    await window.electron.startUpdateDownload();
  };

  const handleRestart = async () => {
    await window.electron.restartToUpdate();
  };

  const handleDismiss = () => {
    setState('idle');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[var(--z-toast)] w-80 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-2xl overflow-hidden"
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-sm font-semibold text-stone-900 dark:text-white">
          Update available — v{info.version}
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* changelog */}
      <p className="px-4 pb-3 text-xs text-stone-600 dark:text-gray-400 line-clamp-4 whitespace-pre-line">
        {info.releaseNotes}
      </p>

      {/* progress bar while downloading */}
      {state === 'downloading' && (
        <div className="mx-4 mb-3 h-1 rounded-full bg-stone-100 dark:bg-white/10 overflow-hidden">
          <div className="h-full w-1/3 bg-sky-500 rounded-full animate-[slide_1.4s_ease-in-out_infinite]" />
        </div>
      )}

      {/* actions */}
      <div className="px-4 pb-4">
        {state === 'ready' ? (
          <button
            onClick={handleRestart}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#28CD56] hover:bg-[#22b84c] text-white text-sm font-medium py-2 transition-colors"
          >
            <RefreshCw size={14} />
            Restart to Install
          </button>
        ) : (
          <button
            onClick={handleDownload}
            disabled={state === 'downloading'}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-medium py-2 transition-colors"
          >
            <Download size={14} />
            {state === 'downloading' ? 'Downloading…' : 'Download Update'}
          </button>
        )}
        {state !== 'ready' && (
          <button
            onClick={handleDismiss}
            className="w-full mt-2 text-xs text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 transition-colors text-center"
          >
            Remind me later
          </button>
        )}
      </div>
    </div>
  );
}
