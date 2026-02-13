'use client';

import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { PreviewFrame } from './PreviewFrame';
import type { PreviewFrameHandle } from './PreviewFrame';
import { PageTypeSelector } from './PageTypeSelector';
import { ResourcePicker } from './ResourcePicker';
import { usePreviewRefresh } from '@/hooks/usePreviewRefresh';
import { buildPreviewUrl } from '@/lib/preview/url-generator';
import { formatDOMContext } from '@/lib/preview/dom-context-formatter';
import type { DOMSnapshot } from '@/lib/preview/dom-context-formatter';
import type { PreviewPageType, PreviewResourceType, PreviewResource } from '@/lib/types/preview';

/** Element data returned by the bridge's element-selected action */
export interface SelectedElement {
  tag: string;
  id: string | null;
  classes: string[];
  selector: string;
  dataAttributes: Record<string, string>;
  textPreview: string;
  styles: Record<string, string>;
  rect: { top: number; left: number; width: number; height: number };
  isApp?: boolean;
  source?: string;
}

/** Handle exposed via forwardRef for parent components (e.g. page.tsx) */
export interface PreviewPanelHandle {
  /**
   * Request a DOM snapshot from the preview iframe and return it as
   * an LLM-friendly formatted string. Returns empty string if preview
   * is not available or times out.
   */
  getDOMContext(timeoutMs?: number): Promise<string>;
}

interface PreviewPanelProps {
  storeDomain: string;
  themeId: string | number;
  projectId: string;
  path?: string;
  syncStatus?: 'connected' | 'syncing' | 'error' | 'disconnected';
  /** True when previewing the source theme while the dev theme syncs in background */
  isSourceThemePreview?: boolean;
  onElementSelected?: (element: SelectedElement) => void;
}

/** Common desktop breakpoint width (px). Single source of truth. */
const DESKTOP_BREAKPOINT = 1280;

const DEVICES = [
  {
    id: 'desktop',
    width: DESKTOP_BREAKPOINT,
    label: 'Desktop',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'tablet',
    width: 768,
    label: 'Tablet',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'mobile',
    width: 375,
    label: 'Mobile',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
];

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel(
    {
      storeDomain,
      themeId,
      projectId,
      path,
      syncStatus,
      isSourceThemePreview,
      onElementSelected,
    },
    ref
  ) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [detachedWindow, setDetachedWindow] = useState<Window | null>(null);
  const [deviceWidth, setDeviceWidth] = useState<number>(DESKTOP_BREAKPOINT);
  const [pageType, setPageType] = useState<PreviewPageType>('home');
  const [browseOpen, setBrowseOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<PreviewResource | null>(null);
  const frameRef = useRef<PreviewFrameHandle>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // Determine preview path from page type + selected resource
  const previewPath = useCallback(() => {
    const base = (() => {
      switch (pageType) {
        case 'home': return '/';
        case 'cart': return '/cart';
        case 'not_found': return '/404';
        case 'product': return selectedResource ? `/products/${selectedResource.handle}` : '/';
        case 'collection': return selectedResource ? `/collections/${selectedResource.handle}` : '/';
        case 'blog': return selectedResource ? `/blogs/${selectedResource.handle}` : '/';
        case 'page': return selectedResource ? `/pages/${selectedResource.handle}` : '/';
        default: return '/';
      }
    })();
    return base;
  }, [pageType, selectedResource]);

  // Resource-browsable page types
  const RESOURCE_PAGE_TYPES: PreviewPageType[] = ['product', 'collection', 'blog', 'page'];
  const needsResource = RESOURCE_PAGE_TYPES.includes(pageType);
  const resourceType: PreviewResourceType | null = needsResource
    ? (pageType as PreviewResourceType)
    : null;

  const handlePageTypeChange = useCallback((type: PreviewPageType) => {
    setPageType(type);
    setSelectedResource(null);
    setBrowseOpen(false);
    // Auto-open browse for resource-needing page types
    if (['product', 'collection', 'blog', 'page'].includes(type)) {
      setBrowseOpen(true);
    }
  }, []);

  const handleResourceSelect = useCallback((resource: PreviewResource) => {
    setSelectedResource(resource);
    setBrowseOpen(false);
  }, []);

  const isDetached = detachedWindow !== null && !detachedWindow.closed;

  // ── getDOMContext: request DOM snapshot from preview bridge ──────────
  const getDOMContext = useCallback(async (timeoutMs = 3000): Promise<string> => {
    try {
      const iframe = frameRef.current?.getIframe();
      if (!iframe?.contentWindow) return '';

      const requestId = crypto.randomUUID();

      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve('');
        }, timeoutMs);

        function handler(event: MessageEvent) {
          const msg = event.data;
          if (
            msg?.type === 'synapse-bridge-response' &&
            msg?.action === 'dom-snapshot' &&
            msg?.requestId === requestId
          ) {
            clearTimeout(timer);
            window.removeEventListener('message', handler);
            const snapshot = msg.data as DOMSnapshot | undefined;
            resolve(formatDOMContext(snapshot));
          }
        }

        window.addEventListener('message', handler);

        // Send snapshot request to bridge
        iframe.contentWindow!.postMessage({
          type: 'synapse-bridge',
          id: requestId,
          action: 'getDOMSnapshot',
          payload: {},
        }, '*');
      });
    } catch {
      return '';
    }
  }, []);

  // Expose getDOMContext to parent via ref
  useImperativeHandle(ref, () => ({
    getDOMContext,
  }), [getDOMContext]);

  // BroadcastChannel for syncing refresh with detached window
  useEffect(() => {
    const channel = new BroadcastChannel(`synapse-preview-${projectId}`);
    broadcastRef.current = channel;
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [projectId]);

  // Check if detached window was closed
  useEffect(() => {
    if (!detachedWindow) return;
    const interval = setInterval(() => {
      if (detachedWindow.closed) {
        setDetachedWindow(null);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [detachedWindow]);

  usePreviewRefresh(projectId, () => {
    setIsRefreshing(true);
    setRefreshToken((prev) => prev + 1);
    // Also notify detached window to refresh
    broadcastRef.current?.postMessage({ type: 'refresh' });
    setTimeout(() => setIsRefreshing(false), 1200);
  });

  const isSyncing = syncStatus === 'syncing';
  const showSyncBadge = isSourceThemePreview || isSyncing;

  // Listen for sync-complete postMessage from syncing iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'synapse-preview-syncing') {
        // The iframe is showing the syncing page — parent knows to push
        // a refresh when sync completes (handled by usePreviewRefresh).
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendBridgeMessage = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const msg = {
        type: 'synapse-bridge',
        id: crypto.randomUUID(),
        action,
        payload: payload ?? {},
      };

      // Send to inline iframe if available
      const iframe = frameRef.current?.getIframe();
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(msg, '*');
      }

      // Also send to detached window if open
      if (detachedWindow && !detachedWindow.closed) {
        detachedWindow.postMessage(msg, '*');
      }
    },
    [detachedWindow]
  );

  const toggleInspect = useCallback(() => {
    const next = !inspecting;
    setInspecting(next);
    sendBridgeMessage(next ? 'enableInspect' : 'disableInspect');
  }, [inspecting, sendBridgeMessage]);

  const handleDetach = useCallback(() => {
    const previewUrl = buildPreviewUrl({ projectId, path });
    const features = 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no';
    const win = window.open(previewUrl, `synapse-preview-${projectId}`, features);
    if (win) {
      setDetachedWindow(win);
    }
  }, [projectId, path]);

  const handleReattach = useCallback(() => {
    if (detachedWindow && !detachedWindow.closed) {
      detachedWindow.close();
    }
    setDetachedWindow(null);
  }, [detachedWindow]);

  // When path changes, update the detached window
  useEffect(() => {
    if (isDetached && path) {
      broadcastRef.current?.postMessage({ type: 'navigate', path });
    }
  }, [path, isDetached]);

  // Suppress unused var warnings -- these props are used for future features
  // (Customizer Mode V1 / direct Shopify API calls) and kept in props
  // to maintain the interface contract. onElementSelected is handled
  // by the parent via the bridge's message listener in page.tsx.
  void storeDomain;
  void themeId;
  void onElementSelected;

  return (
    <section
      className={`flex flex-col gap-3 ${isFullscreen ? 'fixed inset-0 z-50 ide-surface p-4' : ''}`}
    >
      {/* ── Preview toolbar row ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Device breakpoint switcher */}
          <div className="flex items-center gap-0.5 rounded-md ide-surface-inset p-0.5">
            {DEVICES.map((device) => {
              const isActive = deviceWidth === device.width;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => setDeviceWidth(device.width)}
                  className={`rounded p-1.5 transition-colors ${
                    isActive
                      ? 'ide-active ide-text'
                      : 'ide-text-muted hover:ide-text-2 ide-hover'
                  }`}
                  title={device.label}
                  aria-label={device.label}
                >
                  {device.icon}
                </button>
              );
            })}
          </div>

          {/* Page type selector */}
          <PageTypeSelector value={pageType} onChange={handlePageTypeChange} />

          {/* Browse button for resource-needing page types */}
          {needsResource && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setBrowseOpen((o) => !o)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  browseOpen
                    ? 'bg-sky-500 dark:bg-sky-600 text-white'
                    : 'ide-surface-input ide-text-2 hover:ide-text ide-hover'
                }`}
                title="Browse resources"
              >
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {selectedResource ? selectedResource.title : 'Browse'}
                </span>
              </button>

              {/* Resource picker dropdown */}
              {browseOpen && resourceType && (
                <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border ide-border ide-surface-pop shadow-xl p-3">
                  <ResourcePicker
                    projectId={projectId}
                    type={resourceType}
                    label={`Select ${pageType}`}
                    onSelect={handleResourceSelect}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Dev theme sync status badge */}
          {showSyncBadge && (
            <span className="flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
              </span>
              {isSourceThemePreview ? 'Live — dev theme syncing' : 'Syncing'}
            </span>
          )}

          {/* Inspect toggle */}
          <button
            type="button"
            onClick={toggleInspect}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              inspecting
                ? 'bg-sky-500 dark:bg-sky-600 text-white'
                : 'ide-surface-input ide-text-2 hover:ide-text ide-hover'
            }`}
            title={inspecting ? 'Exit Inspect mode' : 'Inspect element'}
          >
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              {inspecting ? 'Inspecting' : 'Inspect'}
            </span>
          </button>

          {/* Pop out / Bring back */}
          <button
            type="button"
            onClick={isDetached ? handleReattach : handleDetach}
            className="rounded ide-surface-input px-2.5 py-1 text-xs ide-text-2 hover:ide-text ide-hover transition-colors"
            title={isDetached ? 'Bring preview back into IDE' : 'Open preview in new window'}
          >
            <span className="flex items-center gap-1">
              {isDetached ? (
                /* Arrow pointing inward (bring back) */
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 4 4 4 4 9" />
                  <line x1="4" y1="4" x2="11" y2="11" />
                  <polyline points="15 20 20 20 20 15" />
                  <line x1="20" y1="20" x2="13" y2="13" />
                </svg>
              ) : (
                /* External link / pop out icon */
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              )}
              {isDetached ? 'Bring back' : 'Pop out'}
            </span>
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => {
              if (isDetached && detachedWindow && !detachedWindow.closed) {
                // Focus the detached window (browser may block this in some cases)
                detachedWindow.focus();
              } else {
                setIsFullscreen((prev) => !prev);
              }
            }}
            className="rounded ide-surface-input px-3 py-1 text-xs ide-text-2 hover:ide-text ide-hover"
          >
            {isDetached ? 'Focus window' : isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {isDetached ? (
        /* Detached placeholder */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 mb-4 rounded-xl ide-surface-input border ide-border flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ide-text-3">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
          <p className="text-sm ide-text-2 font-medium">Preview in external window</p>
          <p className="text-xs ide-text-muted mt-1">
            Move it to a second monitor for side-by-side editing.
          </p>
          <button
            type="button"
            onClick={handleReattach}
            className="mt-4 px-4 py-1.5 rounded ide-surface-input text-xs ide-text-2 hover:ide-text ide-hover transition-colors"
          >
            Bring back to IDE
          </button>
        </div>
      ) : (
        <PreviewFrame
          ref={frameRef}
          projectId={projectId}
          path={selectedResource ? previewPath() : path}
          isFullscreen={isFullscreen}
          refreshToken={refreshToken}
          isRefreshing={isRefreshing || isSyncing}
          deviceWidth={deviceWidth}
        />
      )}
    </section>
  );
  }
);
