'use client';

import { useState } from 'react';
import { PreviewFrame } from './PreviewFrame';
import { usePreviewRefresh } from '@/hooks/usePreviewRefresh';

interface PreviewPanelProps {
  storeDomain: string;
  themeId: string | number;
  projectId: string;
  path?: string;
  /** When 'syncing', show "Syncing to store…" state. */
  syncStatus?: 'connected' | 'syncing' | 'error' | 'disconnected';
}

export function PreviewPanel({
  storeDomain,
  themeId,
  projectId,
  path,
  syncStatus,
}: PreviewPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  usePreviewRefresh(projectId, () => {
    setIsRefreshing(true);
    setRefreshToken((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 1200);
  });

  const isSyncing = syncStatus === 'syncing';

  return (
    <section className={`flex flex-col gap-3 ${isFullscreen ? 'fixed inset-0 z-50 bg-gray-950 p-4' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Preview</h2>
          <p className="text-xs text-gray-400">
            {isSyncing
              ? 'Syncing to store…'
              : `Shopify native rendering (theme ${String(themeId)})`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      <PreviewFrame
        storeDomain={storeDomain}
        themeId={themeId}
        path={path}
        isFullscreen={isFullscreen}
        refreshToken={refreshToken}
        isRefreshing={isRefreshing || isSyncing}
      />
    </section>
  );
}
