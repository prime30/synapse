'use client';

import { useMemo, useState } from 'react';
import { buildPreviewUrl } from '@/lib/preview/url-generator';

interface PreviewFrameProps {
  storeDomain: string;
  themeId: string | number;
  path?: string;
  isFullscreen?: boolean;
  refreshToken?: number;
  isRefreshing?: boolean;
  className?: string;
}

export function PreviewFrame({
  storeDomain,
  themeId,
  path,
  isFullscreen = false,
  refreshToken,
  isRefreshing = false,
  className,
}: PreviewFrameProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(
    () => buildPreviewUrl({ storeDomain, themeId, path }),
    [storeDomain, themeId, path]
  );

  return (
    <div
      className={`relative rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden ${isFullscreen ? 'h-full w-full' : 'h-[520px]'} ${className ?? ''}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/70 text-sm text-gray-300">
          Loading preview...
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 text-sm text-red-300">
          {error}
        </div>
      )}

      {isRefreshing && !loading && (
        <div className="absolute top-2 right-2 rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-200">
          Refreshing...
        </div>
      )}

      <iframe
        title="Shopify Preview"
        src={previewUrl}
        key={refreshToken ?? previewUrl}
        className="h-full w-full"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => {
          setLoading(false);
          setError(null);
        }}
        onError={() => {
          setLoading(false);
          setError('Failed to load preview');
        }}
      />
    </div>
  );
}
