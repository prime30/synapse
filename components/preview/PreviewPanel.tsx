'use client';

import { useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { PreviewFrame } from './PreviewFrame';
import type { PreviewFrameHandle } from './PreviewFrame';
import { PreviewSessionModal } from './PreviewSessionModal';
import { PageTypeSelector } from './PageTypeSelector';
import { CreateTemplateModal } from './CreateTemplateModal';
import { usePreviewRefresh } from '@/hooks/usePreviewRefresh';
import { buildPreviewUrl } from '@/lib/preview/url-generator';
import type { PreviewMode } from '@/lib/preview/url-generator';
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
import { isElectron } from '@/lib/utils/environment';
import { useDevStorePreview } from '@/hooks/useDevStorePreview';

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
  /**
   * Get recent console errors and warnings from the preview for verification.
   * Returns { logs: Array<{ level, message, ts }> } or null if unavailable.
   */
  getConsoleLogs(search?: string): Promise<{ logs: Array<{ level: string; message: string; ts: number }> } | null>;
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

// ---------------------------------------------------------------------------
// Relevant liquid file tabs with hidden scrollbar + chevron overflow indicator
// ---------------------------------------------------------------------------

function RelevantFileTabs({ files, onFileClick }: { files: string[]; onFileClick?: (fp: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScroll(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkOverflow, files]);

  const scrollRight = useCallback(() => {
    scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex items-center gap-0.5 min-w-0 flex-1">
      <div ref={scrollRef} className="flex items-center gap-1 min-w-0 overflow-hidden">
        {files.map((fp) => (
          <button
            key={fp}
            type="button"
            onClick={() => onFileClick?.(fp)}
            className="inline-flex items-center shrink-0 rounded-md ide-surface-inset px-2 py-0.5 text-[11px] font-mono ide-text-2 hover:ide-text hover:bg-accent/10 transition-colors truncate max-w-[180px] cursor-pointer"
            title={`Open ${fp}`}
          >
            {fp.split('/').pop()}
          </button>
        ))}
      </div>
      {canScroll && (
        <button
          type="button"
          onClick={scrollRight}
          className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded ide-text-muted hover:ide-text-2 transition-colors"
          title="Scroll to see more files"
          aria-label="Scroll to see more files"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

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
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [desktopLoginRequired, setDesktopLoginRequired] = useState(false);
  const [previewSessionStatus, setPreviewSessionStatus] = useState<'none' | 'active' | 'expired' | 'auto' | 'online' | 'tka' | 'cli'>('none');
  const [onlineTokenExpiry, setOnlineTokenExpiry] = useState<string | null>(null);
  const [cliStatus, setCLIStatus] = useState<'stopped' | 'pulling' | 'starting' | 'running' | 'error'>('stopped');
  const [cliError, setCLIError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('proxy');
  const desktopPreviewRef = useRef<HTMLDivElement>(null);
  const isDesktopApp = useMemo(() => isElectron(), []);
  const { status: devStoreStatus } = useDevStorePreview(projectId);
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

  // Derive relevant Liquid files from the current preview URL + visible sections.
  // Use path prop as fallback when bridge hasn't reported liveUrlPath yet (e.g. product-form-dynamic shows for product pages).
  const relevantLiquidFiles = useMemo(() => {
    const pathForRelevant = liveUrlPath ?? path ?? null;
    if (!pathForRelevant) return [];
    const result = deriveRelevantLiquidFiles(pathForRelevant, liveVisibleSections);
    return flattenRelevantFiles(result);
  }, [liveUrlPath, liveVisibleSections, path]);

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

  // ── getConsoleLogs: return recent console errors/warnings for verification (E2)
  const getConsoleLogs = useCallback(
    async (search?: string): Promise<{ logs: Array<{ level: string; message: string; ts: number }> } | null> => {
      try {
        const iframe = frameRef.current?.getIframe();
        const contentWindow = iframe?.contentWindow;
        if (!contentWindow) return null;

        const requestId = crypto.randomUUID();

        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve(null);
          }, 3000);

          function handler(event: MessageEvent) {
            const msg = event.data;
            if (
              msg?.type === 'synapse-bridge-response' &&
              msg?.action === 'getConsoleLogs' &&
              (msg.id === requestId || msg.requestId === requestId)
            ) {
              clearTimeout(timer);
              window.removeEventListener('message', handler);
              const data = msg.data as { logs?: Array<{ level: string; message: string; ts: number }> } | undefined;
              resolve(data?.logs ? { logs: data.logs } : { logs: [] });
            }
          }

          window.addEventListener('message', handler);

          contentWindow.postMessage(
            {
              type: 'synapse-bridge',
              id: requestId,
              action: 'getConsoleLogs',
              payload: { search: search ?? '' },
            },
            '*'
          );
        });
      } catch {
        return null;
      }
    },
    []
  );

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

  // Listen for postMessages from the preview iframe (sync status, open modal)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'synapse-preview-syncing') {
        // The iframe is showing the syncing page — parent knows to push
        // a refresh when sync completes (handled by usePreviewRefresh).
      }
      if (e.data?.type === 'synapse-open-session-modal') {
        setSessionModalOpen(true);
      }
      if (e.data?.type === 'synapse-start-cli-preview') {
        startCLIPreview();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Start the CLI dev server for preview
  const startCLIPreview = useCallback(async () => {
    if (cliStatus === 'pulling' || cliStatus === 'starting' || cliStatus === 'running') return;
    setCLIStatus('pulling');
    setCLIError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/cli-preview`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setCLIStatus('error');
        setCLIError(data.error ?? 'Failed to start CLI preview');
        return;
      }
      setCLIStatus(data.status === 'running' ? 'running' : 'starting');
    } catch (err) {
      setCLIStatus('error');
      setCLIError(err instanceof Error ? err.message : 'Network error');
    }
  }, [projectId, cliStatus]);

  // Poll CLI status while it's starting
  useEffect(() => {
    if (cliStatus !== 'starting' && cliStatus !== 'pulling') return;
    let cancelled = false;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/cli-preview`);
        if (cancelled) return;
        const data = await res.json();
        if (data.status === 'running') {
          setCLIStatus('running');
          setRefreshToken((prev) => prev + 1);
          clearInterval(poll);
        } else if (data.status === 'error') {
          setCLIStatus('error');
          setCLIError(data.error ?? 'CLI server failed');
          clearInterval(poll);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [cliStatus, projectId]);

  // Check preview session status via the preview-session API
  useEffect(() => {
    if (!projectId || !themeId) return;
    let cancelled = false;
    async function checkSession() {
      try {
        // Check CLI status (update indicator only — don't force mode switch)
        const cliRes = await fetch(`/api/projects/${projectId}/cli-preview`);
        if (!cancelled) {
          const cliData = await cliRes.json();
          if (cliData.running) {
            setCLIStatus('running');
          }
        }

        const res = await fetch(`/api/projects/${projectId}/preview-session`);
        if (cancelled) return;
        const data = await res.json();
        if (data.status === 'tka') {
          setPreviewSessionStatus('tka');
        } else if (data.status === 'online') {
          setPreviewSessionStatus('online');
          setOnlineTokenExpiry(data.expires_at ?? null);
        } else if (data.status === 'auto' || data.status === 'active') {
          setPreviewSessionStatus(data.status);
        } else if (data.status === 'expired') {
          setPreviewSessionStatus('expired');
        } else {
          setPreviewSessionStatus('none');
        }
      } catch {
        // Network error — leave status as-is
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [projectId, themeId, refreshToken]);

  // Electron: listen for navigation events from the WebContentsView
  // If Shopify redirects to admin login, show a login prompt overlay.
  // Once the user logs in and the URL returns to the storefront, auto-retry the preview.
  useEffect(() => {
    if (!isDesktopApp) return;

    const removeListener = window.electron?.on('preview:url-changed', (...args: unknown[]) => {
      const url = args[0] as string;
      const isLoginPage = url.includes('/admin/auth/login') || url.includes('/admin/login');
      const isAdminDashboard = url.includes('/admin') && !isLoginPage;

      if (isLoginPage) {
        setDesktopLoginRequired(true);
      } else if (isAdminDashboard && desktopLoginRequired) {
        // User just finished logging in — navigate to the preview URL
        setDesktopLoginRequired(false);
        if (storeDomain && themeId) {
          const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
          const previewUrl = `https://${cleanDomain}/${effectivePath.replace(/^\//, '')}?preview_theme_id=${themeId}&_fd=0&pb=0`;
          window.electron?.preview.navigate(previewUrl);
        }
      } else if (!isLoginPage && !isAdminDashboard) {
        // Back on the storefront — clear the login prompt
        setDesktopLoginRequired(false);
      }
    });

    return () => removeListener?.();
  }, [isDesktopApp, storeDomain, themeId, effectivePath, desktopLoginRequired]);

  // Electron WebContentsView: navigate when path or theme changes
  useEffect(() => {
    if (!isDesktopApp || !storeDomain || !themeId) return;
    const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
    const url = `https://${cleanDomain}/${effectivePath.replace(/^\//, '')}?preview_theme_id=${themeId}&_fd=0&pb=0`;
    window.electron?.preview.navigate(url);
  }, [isDesktopApp, storeDomain, themeId, effectivePath]);

  // Electron BrowserView: resize to match container
  useEffect(() => {
    if (!isDesktopApp || !desktopPreviewRef.current) return;
    const el = desktopPreviewRef.current;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      window.electron?.preview.resize({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.electron?.preview.destroy();
    };
  }, [isDesktopApp]);

  // Electron BrowserView: refresh when refreshToken changes
  useEffect(() => {
    if (!isDesktopApp) return;
    window.electron?.preview.refresh();
  }, [isDesktopApp, refreshToken]);

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
    getConsoleLogs,
    async injectCSS(css: string) {
      sendBridgeMessage('injectCSS', { css });
    },
    async clearCSS() {
      sendBridgeMessage('clearCSS');
    },
  }), [getDOMContext, getRawSnapshot, getConsoleLogs, sendBridgeMessage]);

  // Keep refs in sync so the bridge-ready handler can re-enable inspect after page nav
  useEffect(() => { sendBridgeMessageRef.current = sendBridgeMessage; }, [sendBridgeMessage]);
  useEffect(() => { inspectingRef.current = inspecting; }, [inspecting]);

  const toggleInspect = useCallback(() => {
    const next = !inspecting;
    setInspecting(next);
    sendBridgeMessage(next ? 'enableInspect' : 'disableInspect');
  }, [inspecting, sendBridgeMessage]);

  const handleDetach = useCallback(() => {
    const previewUrl = buildPreviewUrl({ projectId, path: effectivePath, mode: previewMode, parityDiagnostic: true });
    const features = 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no';
    const win = window.open(previewUrl, `synapse-preview-${projectId}`, features);
    if (win) {
      setDetachedWindow(win);
    }
  }, [projectId, effectivePath, previewMode]);

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
  void onElementSelected;

  return (
    <section
      className={`flex flex-col ${fill ? 'h-full flex-1 min-h-0' : 'gap-2'}`}
    >
      {/* ── Preview toolbar row ──────────────────────────────────── */}
      <div className={`flex items-center gap-2 shrink-0 ${fill ? 'px-2 py-1.5 border-b ide-border-subtle' : ''}`}>
        {/* Left: inspect + annotate */}
        <div className="flex items-center gap-1">
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

        {/* Center: device breakpoint + page type dropdown + refresh icon */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {/* Device breakpoint — cycles on click */}
          <button
            type="button"
            onClick={() => {
              const idx = DEVICES.findIndex((d) => d.width === deviceWidth);
              const next = DEVICES[(idx + 1) % DEVICES.length];
              setDeviceWidth(next.width);
            }}
            className="rounded p-1.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            title={DEVICES.find((d) => d.width === deviceWidth)?.label ?? 'Device'}
            aria-label={`Switch device (${DEVICES.find((d) => d.width === deviceWidth)?.label ?? 'Desktop'})`}
          >
            {DEVICES.find((d) => d.width === deviceWidth)?.icon ?? DEVICES[0].icon}
          </button>
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

        {/* Right: mode toggle + status badges + pop out */}
        <div className="flex items-center gap-1.5">
          {/* Preview mode toggle */}
          {!isDesktopApp && themeId && (
            <div className="flex items-center rounded-md bg-stone-100 dark:bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setPreviewMode('proxy');
                  setRefreshToken((prev) => prev + 1);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  previewMode === 'proxy'
                    ? 'bg-white dark:bg-white/10 text-stone-900 dark:text-white shadow-sm'
                    : 'ide-text-muted hover:text-stone-900 dark:hover:text-white'
                }`}
                title="Native mode: Shopify's renderer via TKA proxy"
              >
                Native
              </button>
              {devStoreStatus.connected && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewMode('devstore');
                    setRefreshToken((prev) => prev + 1);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    previewMode === 'devstore'
                      ? 'bg-white dark:bg-white/10 text-stone-900 dark:text-white shadow-sm'
                      : 'ide-text-muted hover:text-stone-900 dark:hover:text-white'
                  }`}
                  title="Dev Store mode: preview on your connected development store"
                >
                  Dev Store
                </button>
              )}
            </div>
          )}

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

          {/* Preview session status badge */}
          {isDesktopApp && themeId && !desktopLoginRequired && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500"
              title="Native preview — Shopify admin session used directly"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Native preview
            </span>
          )}
          {isDesktopApp && themeId && desktopLoginRequired && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400"
              title="Log in to Shopify admin in the preview pane to enable draft theme preview"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
              </span>
              Login required
            </span>
          )}
          {!isDesktopApp && themeId && previewSessionStatus === 'cli' && previewMode === 'cli' && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500"
              title="Shopify CLI dev server running — live draft theme preview"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              CLI Preview
            </span>
          )}
          {!isDesktopApp && themeId && previewSessionStatus === 'tka' && previewMode === 'proxy' && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500"
              title="Shopify storefront proxy — rendering through Shopify's native renderer"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Proxy Preview
            </span>
          )}
          {!isDesktopApp && themeId && previewSessionStatus === 'tka' && previewMode === 'cli' && cliStatus !== 'running' && (
            <button
              type="button"
              onClick={startCLIPreview}
              disabled={cliStatus === 'pulling' || cliStatus === 'starting'}
              className="flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-400 hover:bg-sky-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              title={cliStatus === 'pulling' ? 'Pulling theme files...' : cliStatus === 'starting' ? 'Starting CLI dev server...' : 'Start Shopify CLI preview for draft theme'}
            >
              {(cliStatus === 'pulling' || cliStatus === 'starting') && (
                <span className="w-3 h-3 border border-sky-400 border-t-transparent rounded-full animate-spin" />
              )}
              {cliStatus === 'pulling' ? 'Pulling theme...' : cliStatus === 'starting' ? 'Starting...' : 'Start Preview'}
            </button>
          )}
          {!isDesktopApp && themeId && previewSessionStatus === 'tka' && previewMode === 'cli' && cliStatus === 'error' && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400 cursor-pointer"
              onClick={() => setSessionModalOpen(true)}
              title={cliError ?? 'CLI preview error'}
            >
              Error
            </span>
          )}
          {/* Dev Store status badges */}
          {!isDesktopApp && themeId && previewMode === 'devstore' && devStoreStatus.connected && (devStoreStatus.pendingFileCount ?? 0) === 0 && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500"
              title="Dev store connected and synced"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Dev Store Preview
            </span>
          )}
          {!isDesktopApp && themeId && previewMode === 'devstore' && devStoreStatus.connected && (devStoreStatus.pendingFileCount ?? 0) > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400"
              title={`${devStoreStatus.pendingFileCount} file${devStoreStatus.pendingFileCount === 1 ? '' : 's'} not pushed to dev store`}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
              </span>
              {devStoreStatus.pendingFileCount} change{devStoreStatus.pendingFileCount === 1 ? '' : 's'} not pushed
            </span>
          )}
          {!isDesktopApp && themeId && previewMode === 'devstore' && !devStoreStatus.connected && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-stone-500/10 px-2 py-1 text-[11px] font-medium text-stone-400"
              title="No dev store connected"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-stone-400" />
              </span>
              Connect Dev Store
            </span>
          )}
          {!isDesktopApp && themeId && previewSessionStatus === 'online' && (
            <button
              type="button"
              onClick={() => setSessionModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              title={onlineTokenExpiry
                ? `Preview authorized — expires ${new Date(onlineTokenExpiry).toLocaleTimeString()}`
                : 'Preview authorized via online token'}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Draft preview
            </button>
          )}
          {!isDesktopApp && themeId && (previewSessionStatus === 'active' || previewSessionStatus === 'auto') && (
            <button
              type="button"
              onClick={() => setSessionModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              title="Preview session connected — showing draft theme"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Draft preview
            </button>
          )}
          {!isDesktopApp && themeId && (previewSessionStatus === 'expired' || previewSessionStatus === 'none') && (
            <button
              type="button"
              onClick={() => setSessionModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-stone-500/10 px-2 py-1 text-[11px] font-medium text-stone-400 dark:text-gray-500 hover:bg-stone-500/20 hover:text-stone-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              title={previewSessionStatus === 'expired'
                ? 'Preview session expired — click to reconnect'
                : 'Showing published theme — connect session for draft preview'}
            >
              {previewSessionStatus === 'expired' ? 'Session expired' : 'Published theme'}
              <span className="text-sky-500 ml-0.5">Connect</span>
            </button>
          )}

          {/* Preview draft in browser (opens with user's Shopify session) */}
          {themeId && (
            <button
              type="button"
              onClick={() => {
                const domain = storeDomain.replace(/^https?:\/\//, '');
                const previewPath = liveUrlPath || effectivePath || '/';
                window.open(
                  `https://${domain}${previewPath}${previewPath.includes('?') ? '&' : '?'}preview_theme_id=${themeId}`,
                  '_blank'
                );
              }}
              className="rounded p-1.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
              title="Preview draft theme in browser (requires Shopify admin login)"
              aria-label="Preview draft theme in browser"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
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
          <div
            className="flex items-center gap-1.5 shrink-0 min-w-0 max-w-[50%] rounded-md ide-surface-inset px-2.5 py-1 group cursor-default"
            title={`Proxy: ${storeDomain} | Theme: ${themeId} | Path: ${liveUrlPath || effectivePath || '/'}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ide-text-muted">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-[11px] font-mono ide-text-3 truncate">
              {liveUrlPath || effectivePath || '/'}
            </span>
            <span className="text-[10px] font-mono ide-text-muted truncate hidden group-hover:inline">
              {storeDomain} &middot; theme:{themeId}
            </span>
          </div>
          {relevantLiquidFiles && relevantLiquidFiles.length > 0 && (
            <RelevantFileTabs files={relevantLiquidFiles} onFileClick={onRelevantFileClick} />
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
          {isDesktopApp ? (
            <div className={`relative ${fill ? 'absolute inset-0' : 'h-[600px]'}`}>
              <div
                ref={desktopPreviewRef}
                className="absolute inset-0"
                style={deviceWidth ? { width: deviceWidth, margin: '0 auto' } : undefined}
              />
              {desktopLoginRequired && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-8 pointer-events-none">
                  <div className="pointer-events-auto mx-4 max-w-sm w-full rounded-xl border border-stone-200 dark:border-white/10 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-sm shadow-2xl p-4 text-center space-y-2">
                    <p className="text-sm font-semibold text-stone-900 dark:text-white">
                      Log in to preview draft theme
                    </p>
                    <p className="text-xs text-stone-500 dark:text-gray-400">
                      Sign in to your Shopify admin above. Once logged in, your unpublished theme will load automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <PreviewFrame
              ref={frameRef}
              projectId={projectId}
              path={effectivePath}
              isFullscreen={isFullscreen}
              refreshToken={refreshToken}
              isRefreshing={isRefreshing || isSyncing}
              deviceWidth={deviceWidth}
              fill={fill}
              mode={previewMode}
            />
          )}
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

      {/* Preview session modal */}
      <PreviewSessionModal
        isOpen={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        projectId={projectId}
        storeDomain={storeDomain}
        onSessionSaved={() => {
          setPreviewSessionStatus('tka');
          setRefreshToken((prev) => prev + 1);
          // Auto-start CLI preview after TKA password is saved
          setTimeout(() => startCLIPreview(), 500);
        }}
      />
    </section>
  );
  }
);
