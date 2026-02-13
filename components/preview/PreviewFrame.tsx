'use client';

import { useMemo, useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { buildPreviewUrl } from '@/lib/preview/url-generator';

/** Default logical height for the non-fullscreen preview viewport (px). */
const PREVIEW_LOGICAL_HEIGHT = 520;

/** Minimum allowed scale so the preview stays usable in very small panels. */
const MIN_SCALE = 0.25;

interface PreviewFrameProps {
  projectId: string;
  path?: string;
  isFullscreen?: boolean;
  refreshToken?: number;
  isRefreshing?: boolean;
  /** The selected breakpoint width (px). Always a concrete number. */
  deviceWidth: number;
  className?: string;
}

export interface PreviewFrameHandle {
  /** The iframe element for postMessage communication */
  getIframe(): HTMLIFrameElement | null;
}

export const PreviewFrame = forwardRef<PreviewFrameHandle, PreviewFrameProps>(
  function PreviewFrame(
    {
      projectId,
      path,
      isFullscreen = false,
      refreshToken,
      isRefreshing = false,
      deviceWidth,
      className,
    },
    ref
  ) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Container measurement
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
      width: 0,
      height: 0,
    });

    useImperativeHandle(ref, () => ({
      getIframe() {
        return iframeRef.current;
      },
    }));

    // ── Measure container with ResizeObserver ─────────────────────
    const measure = useCallback(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize((prev) => {
        // Avoid unnecessary re-renders if dimensions haven't changed
        if (Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      // Initial measurement
      measure();
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }, [measure]);

    const previewUrl = useMemo(
      () => buildPreviewUrl({ projectId, path }),
      [projectId, path]
    );

    // ── Compute scale factor ─────────────────────────────────────
    const logicalHeight = isFullscreen ? containerSize.height : PREVIEW_LOGICAL_HEIGHT;

    const scale = useMemo(() => {
      if (containerSize.width === 0 || logicalHeight === 0) return 1;
      const scaleX = Math.min(1, containerSize.width / deviceWidth);
      const scaleY = Math.min(1, containerSize.height / logicalHeight);
      return Math.max(MIN_SCALE, Math.min(scaleX, scaleY));
    }, [containerSize.width, containerSize.height, deviceWidth, logicalHeight]);

    // Scaled wrapper dimensions to prevent layout gaps
    const scaledWidth = deviceWidth * scale;
    const scaledHeight = logicalHeight * scale;

    return (
      <div
        ref={containerRef}
        className={`relative rounded-lg border ide-border ide-surface-panel overflow-hidden flex items-start justify-center ${isFullscreen ? 'h-full w-full' : 'h-[520px]'} ${className ?? ''}`}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-100/90 dark:bg-[#0a0a0a]/90 text-sm ide-text-2 z-10">
            Loading preview...
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-100/95 dark:bg-[#0a0a0a]/95 text-sm text-red-600 dark:text-red-400 z-10">
            {error}
          </div>
        )}

        {/* Refresh indicator */}
        {isRefreshing && !loading && (
          <div className="absolute top-2 right-2 rounded ide-surface-pop border ide-border px-2 py-1 text-xs ide-text-2 z-10">
            Refreshing...
          </div>
        )}

        {/* ── Scaled viewport wrapper ────────────────────────────── */}
        {/*
          Outer "scaled wrapper" — its size is the *scaled* dimensions so
          it occupies the right amount of space in the layout and allows
          the parent flex container to center it.
        */}
        <div
          className="flex-shrink-0"
          style={{
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
          {/*
            Inner "viewport" — fixed at breakpoint × logical height,
            then scaled down via CSS transform. transformOrigin is top-left
            so the scaled content aligns to the outer wrapper's top-left.
          */}
          <div
            className="origin-top-left"
            style={{
              width: deviceWidth,
              height: logicalHeight,
              transform: scale < 1 ? `scale(${scale})` : undefined,
            }}
          >
            <iframe
              ref={iframeRef}
              title="Shopify Preview"
              src={previewUrl}
              key={refreshToken ?? previewUrl}
              className="h-full w-full"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation"
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
        </div>
      </div>
    );
  }
);
