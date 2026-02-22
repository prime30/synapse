'use client';

import { useMemo, useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { buildPreviewUrl } from '@/lib/preview/url-generator';

/** Default fixed height when not in fill mode (legacy). */
const FIXED_HEIGHT = 520;

/** Fallback height before the stage has been measured. */
const DEFAULT_VIEWPORT_HEIGHT = 900;

/** Minimum allowed scale so the preview stays usable in very small panels. */
const MIN_SCALE = 0.25;

/** Duration of the fade-out / fade-in transition (ms). */
const FADE_MS = 180;

interface PreviewFrameProps {
  projectId: string;
  path?: string;
  isFullscreen?: boolean;
  refreshToken?: number;
  isRefreshing?: boolean;
  /** The selected breakpoint width (px). Always a concrete number. */
  deviceWidth: number;
  className?: string;
  /** When true, the frame fills its parent height instead of using a fixed 520px height */
  fill?: boolean;
}

export interface PreviewFrameHandle {
  /** The iframe element for postMessage communication */
  getIframe(): HTMLIFrameElement | null;
  /** Reload the current iframe page without remounting (preserves navigation state) */
  reload(): void;
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
      fill = false,
    },
    ref
  ) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Stage measurement (the dark background container)
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageWidth, setStageWidth] = useState(0);
    const [stageHeight, setStageHeight] = useState(0);

    // ── Fade transition state ───────────────────────────────────
    // Opacity is 1 normally; on refresh it fades to 0, updates src, then fades to 1.
    const [opacity, setOpacity] = useState(1);
    const [iframeSrc, setIframeSrc] = useState(() =>
      buildPreviewUrl({ projectId, path })
    );
    // Track the previous refreshToken to detect changes (skip initial mount)
    const prevRefreshTokenRef = useRef(refreshToken);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Whether the iframe has completed its first load (skip fade on initial render)
    const hasLoadedOnce = useRef(false);

    useImperativeHandle(ref, () => ({
      getIframe() {
        return iframeRef.current;
      },
      reload() {
        try {
          iframeRef.current?.contentWindow?.location.reload();
        } catch {
          // Cross-origin or sandbox restriction — silent fallback
        }
      },
    }));

    // ── Measure stage width + height with ResizeObserver ─────────
    const measure = useCallback(() => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      setStageWidth((prev) => (Math.abs(prev - rect.width) < 1 ? prev : rect.width));
      setStageHeight((prev) => (Math.abs(prev - rect.height) < 1 ? prev : rect.height));
    }, []);

    useEffect(() => {
      const el = stageRef.current;
      if (!el) return;
      measure();
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }, [measure]);

    // ── Update iframe src when projectId / path change (not refresh) ──
    useEffect(() => {
      const nextSrc = buildPreviewUrl({ projectId, path });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73e657'},body:JSON.stringify({sessionId:'73e657',runId:'run1',hypothesisId:'H3',location:'components/preview/PreviewFrame.tsx:src-effect',message:'iframe src updated',data:{projectId,path:path ?? '/',nextSrc},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setIframeSrc(nextSrc);
    }, [projectId, path]);

    // ── Fade-refresh cycle when refreshToken changes ─────────────
    useEffect(() => {
      // Skip the initial mount (no previous token to compare)
      if (prevRefreshTokenRef.current === refreshToken) return;
      prevRefreshTokenRef.current = refreshToken;

      // Don't fade if the iframe hasn't loaded yet (initial load in progress)
      if (!hasLoadedOnce.current) return;

      // Phase 1: fade out
      setOpacity(0);

      // Phase 2: after fade-out completes, update the src with cache-bust
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        setIframeSrc(buildPreviewUrl({ projectId, path, cacheBust: true }));
        // Opacity will be restored in the onLoad handler
      }, FADE_MS);

      return () => {
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      };
    }, [refreshToken, projectId, path]);

    // ── Handlers ────────────────────────────────────────────────
    const handleLoad = useCallback(() => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73e657'},body:JSON.stringify({sessionId:'73e657',runId:'run1',hypothesisId:'H2',location:'components/preview/PreviewFrame.tsx:handleLoad',message:'iframe onLoad fired',data:{iframeSrc},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setLoading(false);
      setError(null);
      hasLoadedOnce.current = true;
      // Fade back in after load completes
      setOpacity(1);
    }, [iframeSrc]);

    const handleError = useCallback(() => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73e657'},body:JSON.stringify({sessionId:'73e657',runId:'run1',hypothesisId:'H2',location:'components/preview/PreviewFrame.tsx:handleError',message:'iframe onError fired',data:{iframeSrc},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setLoading(false);
      setError('Failed to load preview');
      // Still fade back in so the error overlay is visible
      setOpacity(1);
    }, [iframeSrc]);

    useEffect(() => {
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type === 'synapse-preview-syncing') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73e657'},body:JSON.stringify({sessionId:'73e657',runId:'run1',hypothesisId:'H4',location:'components/preview/PreviewFrame.tsx:message-syncing',message:'received syncing message from iframe',data:{status:e.data?.status ?? 'unknown'},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        }
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, []);

    const useFill = isFullscreen || fill;

    // ── Compute scale: shrink bento to fit stage width (with padding) ──
    const bentoMaxWidth = useFill ? stageWidth - 16 : stageWidth; // 8px padding each side (p-2) in fill mode
    const scale = useMemo(() => {
      if (bentoMaxWidth <= 0) return 1;
      const s = bentoMaxWidth / deviceWidth;
      return s >= 1 ? 1 : Math.max(MIN_SCALE, s);
    }, [bentoMaxWidth, deviceWidth]);

    const scaledWidth = deviceWidth * scale;
    // In fill mode, reverse-scale the available container height so the iframe
    // renders at native device dimensions, then CSS transform shrinks it back.
    // This makes the iframe fit the viewport — page scrolls inside the iframe.
    const fillHeight = stageHeight > 0 ? Math.round(stageHeight / scale) : DEFAULT_VIEWPORT_HEIGHT;
    const iframeHeight = useFill ? fillHeight : FIXED_HEIGHT;
    const scaledHeight = iframeHeight * scale;

    /** Style applied to the wrapper around the iframe for fade transitions */
    const fadeStyle: React.CSSProperties = {
      opacity,
      transition: `opacity ${FADE_MS}ms ease`,
    };

    /* ── Non-fill mode: simple bordered frame (legacy) ─────────── */
    if (!useFill) {
      return (
        <div
          ref={stageRef}
          className={`relative rounded-lg border ide-border ide-surface-panel overflow-x-hidden overflow-y-auto flex flex-col items-center scrollbar-thin h-[520px] ${className ?? ''}`}
        >
          {loading && <LoadingSkeleton />}
          {error && <ErrorOverlay message={error} />}
          {isRefreshing && !loading && <RefreshBadge />}
          <div className="flex-shrink-0" style={{ width: scaledWidth, height: scaledHeight, ...fadeStyle }}>
            <div
              className="origin-top-left"
              style={{
                width: deviceWidth,
                height: iframeHeight,
                transform: scale < 1 ? `scale(${scale})` : undefined,
              }}
            >
              <IframeEl
                ref={iframeRef}
                src={iframeSrc}
                onLoad={handleLoad}
                onError={handleError}
              />
            </div>
          </div>
        </div>
      );
    }

    /* ── Fill mode: recessed stage + centered bento card ────── */
    return (
      <div
        ref={stageRef}
        className={`relative h-full w-full ide-surface-inset overflow-hidden ${className ?? ''}`}
      >
        {/* Overlays (positioned relative to the stage) */}
        {loading && <LoadingSkeleton />}
        {error && <ErrorOverlay message={error} />}
        {isRefreshing && !loading && <RefreshBadge />}

        {/* Centered bento card — fits viewport height, page scrolls inside iframe */}
        <div className="flex justify-center h-full p-2">
          <div
            className="flex-shrink-0 rounded-xl shadow-xl overflow-hidden ide-surface-panel"
            style={{ width: scaledWidth, height: scaledHeight, ...fadeStyle }}
          >
            <div
              className="origin-top-left"
              style={{
                width: deviceWidth,
                height: iframeHeight,
                transform: scale < 1 ? `scale(${scale})` : undefined,
              }}
            >
              <IframeEl
                ref={iframeRef}
                src={iframeSrc}
                onLoad={handleLoad}
                onError={handleError}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

/* ================================================================== */
/*  Sub-components (extracted to reduce duplication)                    */
/* ================================================================== */

interface IframeElProps {
  src: string;
  onLoad: () => void;
  onError: () => void;
}

const IframeEl = forwardRef<HTMLIFrameElement, IframeElProps>(
  function IframeEl({ src, onLoad, onError }, ref) {
    return (
      <iframe
        ref={ref}
        title="Shopify Preview"
        src={src}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation"
        onLoad={onLoad}
        onError={onError}
      />
    );
  }
);

function LoadingSkeleton() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center ide-surface-inset">
      {/* Fake browser chrome bar */}
      <div className="w-full flex items-center gap-2 px-4 py-2.5 border-b ide-border-subtle">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400/40" />
        </div>
        <div className="flex-1 mx-4">
          <div className="h-5 rounded-md ide-surface-input animate-pulse max-w-xs mx-auto" />
        </div>
      </div>
      {/* Skeleton content blocks */}
      <div className="w-full max-w-md px-6 pt-8 space-y-4">
        <div className="h-40 rounded-lg ide-surface-input animate-pulse" />
        <div className="space-y-2.5">
          <div className="h-4 rounded ide-surface-input animate-pulse w-3/4" />
          <div className="h-4 rounded ide-surface-input animate-pulse w-5/6" />
          <div className="h-4 rounded ide-surface-input animate-pulse w-2/3" />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="h-24 rounded-lg ide-surface-input animate-pulse" />
          <div className="h-24 rounded-lg ide-surface-input animate-pulse" />
          <div className="h-24 rounded-lg ide-surface-input animate-pulse" />
        </div>
        <div className="space-y-2.5 pt-2">
          <div className="h-4 rounded ide-surface-input animate-pulse w-4/5" />
          <div className="h-4 rounded ide-surface-input animate-pulse w-3/5" />
        </div>
      </div>
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center ide-surface-inset text-sm text-red-600 dark:text-red-400 z-10">
      {message}
    </div>
  );
}

function RefreshBadge() {
  return (
    <div className="absolute top-2 right-2 rounded ide-surface-pop border ide-border px-2 py-1 text-xs ide-text-2 z-10">
      Refreshing...
    </div>
  );
}
