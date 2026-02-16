'use client';

import { useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { PreviewFrame } from './PreviewFrame';
import type { PreviewFrameHandle } from './PreviewFrame';
import { PageTypeSelector } from './PageTypeSelector';
import { CreateTemplateModal } from './CreateTemplateModal';
import { usePreviewRefresh } from '@/hooks/usePreviewRefresh';
import { buildPreviewUrl } from '@/lib/preview/url-generator';
import { formatDOMContext } from '@/lib/preview/dom-context-formatter';
import type { DOMSnapshot } from '@/lib/preview/dom-context-formatter';
import type { PreviewResource } from '@/lib/types/preview';
import { buildTemplateEntries, getTemplateVariants } from '@/lib/preview/template-classifier';
import type { TemplateEntry } from '@/lib/preview/template-classifier';
import { PreviewAnnotator } from './PreviewAnnotator';
import type { AnnotationData } from './PreviewAnnotator';
import {
  deriveRelevantLiquidFiles,
  flattenRelevantFiles,
  type VisibleSection,
} from '@/lib/preview/relevant-liquid-files';

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
  /** Liquid section file path resolved from the nearest section ancestor, e.g. "sections/main-product.liquid" */
  liquidSection?: string;
}

/** Handle exposed via forwardRef for parent components (e.g. page.tsx) */
export interface PreviewPanelHandle {
  /**
   * Request a DOM snapshot from the preview iframe and return it as
   * an LLM-friendly formatted string. Returns empty string if preview
   * is not available or times out.
   */
  getDOMContext(timeoutMs?: number): Promise<string>;
  /**
   * Request a raw DOM snapshot from the preview iframe for structural comparison.
   * Returns the unformatted DOMSnapshot object, or null if unavailable.
   * Used by EPIC V3 preview verification to capture before/after snapshots.
   */
  getRawSnapshot(timeoutMs?: number): Promise<DOMSnapshot | null>;
  /**
   * Phase 4a: Inject CSS into the preview for live hot-reload.
   */
  injectCSS(css: string): Promise<void>;
  /**
   * Phase 4a: Clear all injected CSS from the preview.
   */
  clearCSS(): Promise<void>;
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
  /** Callback when user submits a preview annotation (Phase 3a) */
  onAnnotation?: (data: AnnotationData) => void;
  /** Phase 4a: Number of live changes being streamed */
  liveChangeCount?: number;
  /** When true, the preview fills its parent container height instead of using fixed height */
  fill?: boolean;
  /** Callback when a relevant liquid file pill is clicked (path e.g. "sections/header.liquid") */
  onRelevantFileClick?: (filePath: string) => void;
  /** Theme files for template-driven dropdown */
  themeFiles?: { id: string; path: string }[];
  /** Callback to refresh files after template creation */
  onFilesRefresh?: () => void;
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
      onAnnotation,
      liveChangeCount = 0,
      fill = false,
      themeFiles,
      onFilesRefresh,
      onRelevantFileClick,
    },
    ref
  ) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [detachedWindow, setDetachedWindow] = useState<Window | null>(null);
  const [deviceWidth, setDeviceWidth] = useState<number>(DESKTOP_BREAKPOINT);
  const [selectedResource, setSelectedResource] = useState<PreviewResource | null>(null);
  const [createModalType, setCreateModalType] = useState<string | null>(null);
  // showRelevantFiles state removed — pills are always visible now
  const frameRef = useRef<PreviewFrameHandle>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  // Refs for values needed inside the bridge-ready handler (closed over in a [] deps effect)
  const inspectingRef = useRef(false);
  const sendBridgeMessageRef = useRef<(action: string, payload?: Record<string, unknown>) => void>(() => {});

  // Live URL path — updated by the bridge's passive context messages
  const [liveUrlPath, setLiveUrlPath] = useState<string | null>(null);
  // Visible sections — updated from passive bridge messages alongside URL
  const [liveVisibleSections, setLiveVisibleSections] = useState<VisibleSection[]>([]);

  // Derive relevant Liquid files from the current preview URL + visible sections
  const relevantLiquidFiles = useMemo(() => {
    if (!liveUrlPath) return [];
    const result = deriveRelevantLiquidFiles(liveUrlPath, liveVisibleSections);
    return flattenRelevantFiles(result);
  }, [liveUrlPath, liveVisibleSections]);

  // Listen for passive bridge messages to track the actual iframe URL
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || msg.type !== 'synapse-bridge-passive') return;
      const rawUrl = msg.data?.url;
      if (typeof rawUrl !== 'string') return;
      try {
        const parsed = new URL(rawUrl, window.location.origin);
        // Strip the proxy prefix: /api/projects/<id>/preview?path=<path>
        const proxyPath = parsed.searchParams.get('path');
        if (proxyPath) {
          setLiveUrlPath(proxyPath);
        } else if (!parsed.pathname.startsWith('/api/projects/')) {
          // Direct Shopify URL (e.g. in detached window) — use pathname
          setLiveUrlPath(parsed.pathname);
        }
      } catch {
        // Malformed URL — ignore
      }
      // Capture visible sections for relevant-files derivation
      const sections = msg.data?.visibleSections;
      if (Array.isArray(sections)) {
        setLiveVisibleSections(sections as VisibleSection[]);
      }
    }

    // Also capture the ready message for initial URL + re-enable inspect after page nav
    function handleReady(event: MessageEvent) {
      const msg = event.data;
      if (msg?.type === 'synapse-bridge-response' && msg?.action === 'ready') {
        const rawUrl = msg.data?.url;
        if (typeof rawUrl === 'string') {
          try {
            const parsed = new URL(rawUrl, window.location.origin);
            const proxyPath = parsed.searchParams.get('path');
            if (proxyPath) setLiveUrlPath(proxyPath);
          } catch { /* ignore */ }
        }
        // Re-enable inspect mode if it was active before page navigation
        if (inspectingRef.current) {
          sendBridgeMessageRef.current('enableInspect');
        }
      }
    }

    window.addEventListener('message', handleMessage);
    window.addEventListener('message', handleReady);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('message', handleReady);
    };
  }, []);

  // Build template entries from theme files
  const templateEntries = useMemo(
    () => buildTemplateEntries((themeFiles ?? []).map((f) => ({ id: f.id, path: f.path }))),
    [themeFiles]
  );

  // Selected template state -- initialise lazily from first entries
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Derive the actual selected template from entries + stored id
  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const match = templateEntries.find((t) => t.filePath === selectedTemplateId);
      if (match) return match;
    }
    // Fallback: home or first entry
    return templateEntries.find((t) => t.templateType === 'index') ?? templateEntries[0] ?? null;
  }, [templateEntries, selectedTemplateId]);

  // Wrapper to update the id
  const setSelectedTemplate = useCallback((entry: TemplateEntry | null) => {
    setSelectedTemplateId(entry?.filePath ?? null);
  }, []);

  // Determine preview path from selected template + resource
  const previewPath = useCallback(() => {
    if (!selectedTemplate) return '/';
    const base = selectedTemplate.previewBasePath;
    if (selectedTemplate.needsResource && selectedResource) {
      return base.endsWith('/') ? `${base}${selectedResource.handle}` : base;
    }
    if (selectedTemplate.needsResource && !selectedResource) return '/';
    return base;
  }, [selectedTemplate, selectedResource]);

  // Effective path for iframe and detached window
  const effectivePath = selectedResource
    ? previewPath()
    : (selectedTemplate && !selectedTemplate.needsResource ? selectedTemplate.previewBasePath : path ?? '/');

  const handleTemplateChange = useCallback((template: TemplateEntry) => {
    setSelectedTemplate(template);
    setSelectedResource(null);
    setLiveUrlPath(null); // Reset so URL bar picks up new page from bridge
  }, [setSelectedTemplate]);

  const handleResourceSelect = useCallback((resource: PreviewResource) => {
    setSelectedResource(resource);
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

  // ── getRawSnapshot: return structured DOMSnapshot for comparison (EPIC V3)
  const getRawSnapshot = useCallback(async (timeoutMs = 3000): Promise<DOMSnapshot | null> => {
    try {
      const iframe = frameRef.current?.getIframe();
      if (!iframe?.contentWindow) return null;

      const requestId = crypto.randomUUID();

      return new Promise<DOMSnapshot | null>((resolve) => {
        const timer = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve(null);
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
            resolve((msg.data as DOMSnapshot) ?? null);
          }
        }

        window.addEventListener('message', handler);

        iframe.contentWindow!.postMessage({
          type: 'synapse-bridge',
          id: requestId,
          action: 'getDOMSnapshot',
          payload: {},
        }, '*');
      });
    } catch {
      return null;
    }
  }, []);

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

  // Expose handle to parent via ref
  useImperativeHandle(ref, () => ({
    getDOMContext,
    getRawSnapshot,
    async injectCSS(css: string) {
      sendBridgeMessage('injectCSS', { css });
    },
    async clearCSS() {
      sendBridgeMessage('clearCSS');
    },
  }), [getDOMContext, getRawSnapshot, sendBridgeMessage]);

  // Keep refs in sync so the bridge-ready handler can re-enable inspect after page nav
  useEffect(() => { sendBridgeMessageRef.current = sendBridgeMessage; }, [sendBridgeMessage]);
  useEffect(() => { inspectingRef.current = inspecting; }, [inspecting]);

  const toggleInspect = useCallback(() => {
    const next = !inspecting;
    setInspecting(next);
    sendBridgeMessage(next ? 'enableInspect' : 'disableInspect');
  }, [inspecting, sendBridgeMessage]);

  const handleDetach = useCallback(() => {
    const previewUrl = buildPreviewUrl({ projectId, path: effectivePath });
    const features = 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no';
    const win = window.open(previewUrl, `synapse-preview-${projectId}`, features);
    if (win) {
      setDetachedWindow(win);
    }
  }, [projectId, effectivePath]);

  const handleReattach = useCallback(() => {
    if (detachedWindow && !detachedWindow.closed) {
      detachedWindow.close();
    }
    setDetachedWindow(null);
  }, [detachedWindow]);

  // When effective path changes, update the detached window
  useEffect(() => {
    if (isDetached && effectivePath) {
      broadcastRef.current?.postMessage({ type: 'navigate', path: effectivePath });
    }
  }, [effectivePath, isDetached]);

  // Suppress unused var warnings -- these props are used for future features
  // (Customizer Mode V1 / direct Shopify API calls) and kept in props
  // to maintain the interface contract. onElementSelected is handled
  // by the parent via the bridge's message listener in page.tsx.
  void storeDomain;
  void themeId;
  void onElementSelected;

  return (
    <section
      className={`flex flex-col ${fill ? 'h-full flex-1 min-h-0' : 'gap-2'}`}
    >
      {/* ── Preview toolbar row ──────────────────────────────────── */}
      <div className={`flex items-center gap-2 shrink-0 ${fill ? 'px-2 py-1.5 border-b ide-border-subtle' : ''}`}>
        {/* Left: device switcher + inspect + annotate */}
        <div className="flex items-center gap-1">
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

          <div className="w-px h-4 ide-border-subtle mx-0.5" />

          {/* Inspect toggle */}
          <button
            type="button"
            onClick={toggleInspect}
            className={`rounded p-1.5 transition-colors ${
              inspecting
                ? 'bg-sky-500 dark:bg-sky-600 text-white'
                : 'ide-text-muted hover:ide-text-2 ide-hover'
            }`}
            title={inspecting ? 'Exit Inspect mode' : 'Inspect element'}
            aria-label={inspecting ? 'Exit Inspect mode' : 'Inspect element'}
          >
            <svg
              width="14"
              height="14"
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
          </button>

          {/* Annotate toggle */}
          {onAnnotation && (
            <button
              type="button"
              onClick={() => {
                setAnnotating((prev) => !prev);
                if (inspecting) { setInspecting(false); sendBridgeMessage('disableInspect'); }
              }}
              className={`rounded p-1.5 transition-colors ${
                annotating
                  ? 'bg-amber-500 dark:bg-amber-600 text-white'
                  : 'ide-text-muted hover:ide-text-2 ide-hover'
              }`}
              title={annotating ? 'Exit Annotate mode' : 'Annotate area for AI'}
              aria-label={annotating ? 'Exit Annotate mode' : 'Annotate area for AI'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 3v18" />
              </svg>
            </button>
          )}
        </div>

        {/* Center: page type dropdown + refresh icon */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <PageTypeSelector
            templates={templateEntries}
            selectedTemplate={selectedTemplate}
            onChange={handleTemplateChange}
            selectedResource={selectedResource}
            onResourceSelect={handleResourceSelect}
            onCreateTemplate={(type) => setCreateModalType(type)}
            projectId={projectId}
          />
          <button
            type="button"
            onClick={() => {
              setIsRefreshing(true);
              setRefreshToken((prev) => prev + 1);
              broadcastRef.current?.postMessage({ type: 'refresh' });
              setTimeout(() => setIsRefreshing(false), 1200);
            }}
            disabled={isRefreshing}
            className="rounded p-1.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh preview"
            aria-label="Refresh preview"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isRefreshing ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* Right: status badges + pop out */}
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

          {/* Phase 4a: Live change indicator */}
          {liveChangeCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              {liveChangeCount} live
            </span>
          )}

          {/* Pop out / Bring back */}
          <button
            type="button"
            onClick={isDetached ? handleReattach : handleDetach}
            className="rounded p-1.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            title={isDetached ? 'Bring preview back into IDE' : 'Open preview in new window'}
            aria-label={isDetached ? 'Bring preview back into IDE' : 'Open preview in new window'}
          >
            {isDetached ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 4 4 4 4 9" />
                <line x1="4" y1="4" x2="11" y2="11" />
                <polyline points="15 20 20 20 20 15" />
                <line x1="20" y1="20" x2="13" y2="13" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── URL path + relevant files bar ────────────────────────── */}
      {!isDetached && (
        <div className={`flex items-center gap-2 shrink-0 ${fill ? 'px-2 py-1 border-b ide-border-subtle' : 'px-1 py-1'}`}>
          <div className="flex items-center gap-1.5 shrink-0 min-w-0 max-w-[40%] rounded-md ide-surface-inset px-2.5 py-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ide-text-muted">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-[11px] font-mono ide-text-3 truncate" title={liveUrlPath || effectivePath || '/'}>
              {liveUrlPath || effectivePath || '/'}
            </span>
          </div>
          {relevantLiquidFiles && relevantLiquidFiles.length > 0 && (
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide">
              {relevantLiquidFiles.map((fp) => (
                <button
                  key={fp}
                  type="button"
                  onClick={() => onRelevantFileClick?.(fp)}
                  className="inline-flex items-center shrink-0 rounded-md ide-surface-inset px-2 py-0.5 text-[11px] font-mono ide-text-2 hover:ide-text hover:bg-accent/10 transition-colors truncate max-w-[180px]"
                  title={fp}
                >
                  {fp.split('/').pop()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
        <div className={fill ? 'flex-1 min-h-0 relative' : 'relative'}>
          <PreviewFrame
            ref={frameRef}
            projectId={projectId}
            path={effectivePath}
            isFullscreen={isFullscreen}
            refreshToken={refreshToken}
            isRefreshing={isRefreshing || isSyncing}
            deviceWidth={deviceWidth}
            fill={fill}
          />
          {/* Phase 3a: Annotation overlay — key forces fresh state on each activation */}
          {annotating && (
            <PreviewAnnotator
              key="annotator"
              active
              onClose={() => setAnnotating(false)}
              onSubmit={(data) => { onAnnotation?.(data); setAnnotating(false); }}
              previewPath={effectivePath}
            />
          )}
        </div>
      )}
      {/* Create template modal */}
      {createModalType && (
        <CreateTemplateModal
          templateType={createModalType}
          existingTemplates={getTemplateVariants(templateEntries, createModalType)}
          projectId={projectId}
          onCreated={(newFilePath) => {
            setCreateModalType(null);
            onFilesRefresh?.();
            // Pre-set the ID so the derived selectedTemplate picks it up
            // once templateEntries refresh with the new file
            setSelectedTemplateId(newFilePath);
          }}
          onClose={() => setCreateModalType(null)}
        />
      )}
    </section>
  );
  }
);
