'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import React, { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoginTransition } from '@/components/features/auth/LoginTransition';
import { FileTabs } from '@/components/features/file-management/FileTabs';
import { FileList } from '@/components/features/file-management/FileList';
import { SearchPanel } from '@/components/features/file-management/SearchPanel';

import { FileEditor, type FileEditorHandle } from '@/components/features/file-management/FileEditor';
import { FileUploadModal } from '@/components/features/file-management/FileUploadModal';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import type { PreviewPanelHandle } from '@/components/preview/PreviewPanel';
// DesignTokenBrowser moved to dedicated Design System page; panel now shows summary + link
import { SuggestionPanel } from '@/components/features/suggestions/SuggestionPanel';
import { VersionHistoryPanel } from '@/components/features/versions/VersionHistoryPanel';
import { DiagnosticsPanel } from '@/components/diagnostics/DiagnosticsPanel';
import { ShopifyConnectPanel } from '@/components/features/shopify/ShopifyConnectPanel';
import { AgentPromptPanel } from '@/components/features/agents/AgentPromptPanel';
import { useFileTabs, PREVIEW_TAB_ID } from '@/hooks/useFileTabs';
import { useAISidebar } from '@/hooks/useAISidebar';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { useWorkspaceDiagnostics } from '@/hooks/useWorkspaceDiagnostics';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import { useProjects, type ReconcileResult } from '@/hooks/useProjects';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useRemoteCursors } from '@/hooks/useRemoteCursors';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { RelatedFilesPrompt, type RelatedFileInfo } from '@/components/features/file-management/RelatedFilesPrompt';
import { getLinkedFileIds, linkMultiple, isDismissed, dismissGroup } from '@/lib/file-linking';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ActivityBar } from '@/components/editor/ActivityBar';
import { TopBar } from '@/components/editor/TopBar';
import { DevReportModal } from '@/components/editor/DevReportModal';
import { useDevReport } from '@/hooks/useDevReport';
import { SectionNav } from '@/components/ui/SectionNav';
import { SettingsModal } from '@/components/editor/SettingsModal';
import { FileBreadcrumb } from '@/components/editor/FileBreadcrumb';
import { StatusBar } from '@/components/editor/StatusBar';
import { BinarySyncIndicator } from '@/components/features/sync/BinarySyncIndicator';
import { LocalSyncIndicator } from '@/components/features/sync/LocalSyncIndicator';
import { UndoToast } from '@/components/ui/UndoToast';
import { HomeModal } from '@/components/features/home/HomeModal';
import { CommandPalette } from '@/components/editor/CommandPalette';
import type { PaletteCommand } from '@/components/editor/CommandPalette';
import { ThemeConsole } from '@/components/editor/ThemeConsole';
import type { ThemeConsoleTab, ThemeConsoleEntry } from '@/components/editor/ThemeConsole';
import { QuickActionsToolbar } from '@/components/editor/QuickActionsToolbar';
import { AmbientBar } from '@/components/ai-sidebar/AmbientBar';
import { IntentCompletionPanel } from '@/components/ai-sidebar/IntentCompletionPanel';
import type { AmbientNudge } from '@/hooks/useAmbientIntelligence';
import type { WorkflowMatch } from '@/lib/ai/workflow-patterns';
import { EditorSettingsProvider } from '@/hooks/useEditorSettings';
import { ChromaticSettingsProvider } from '@/hooks/useChromaticSettings';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { AnnotationData } from '@/components/preview/PreviewAnnotator';
import { useLivePreview } from '@/hooks/useLivePreview';
import { classifyTemplateFile } from '@/lib/preview/template-classifier';
import type { TokenUsage } from '@/components/features/agents/AgentPromptPanel';
import type { ThemeReviewReport as ThemeReviewReportData } from '@/lib/ai/theme-reviewer';
import { useCanvasData } from '@/hooks/useCanvasData';
import { useTemplateLayout } from '@/hooks/useTemplateLayout';
import { useAuth } from '@/components/features/auth/AuthProvider';
import { usePassiveContext } from '@/hooks/usePassiveContext';
import { useDesignTokens } from '@/hooks/useDesignTokens';
import { useMemory } from '@/hooks/useMemory';
import { resolveFileId } from '@/lib/ai/file-path-detector';
import { usePreviewVerification } from '@/hooks/usePreviewVerification';
import { detectConventions, type ThemeFile } from '@/lib/ai/convention-detector';
import { analyzeDiff } from '@/lib/ai/diff-analyzer';

// EPIC 15: Lazy-load canvas (zero bundle cost for non-canvas users)
const CanvasView = React.lazy(() =>
  import('@/components/canvas/CanvasView').then((mod) => ({ default: mod.CanvasView }))
);

// Dynamic imports for heavy panels (loaded only when their tab is active)
const AssetBrowserPanel = dynamic(
  () => import('@/components/features/assets/AssetBrowserPanel'),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const TemplateComposer = dynamic(
  () => import('@/components/features/templates/TemplateComposer').then(m => ({ default: m.TemplateComposer })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const MetafieldExplorer = dynamic(
  () => import('@/components/features/content/MetafieldExplorer').then(m => ({ default: m.MetafieldExplorer })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const PublishRequestPanel = dynamic(
  () => import('@/components/features/shopify/PublishRequestPanel').then(m => ({ default: m.PublishRequestPanel })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const PerformanceDashboard = dynamic(
  () => import('@/components/features/quality/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const A11yPanel = dynamic(
  () => import('@/components/features/quality/A11yPanel').then(m => ({ default: m.A11yPanel })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);
const ImageOptPanel = dynamic(
  () => import('@/components/features/quality/ImageOptPanel').then(m => ({ default: m.ImageOptPanel })),
  { ssr: false, loading: () => <div className="p-4 ide-text-3 text-sm">Loading…</div> }
);

// A7: Dynamic imports for agent workflow modals (heavy, rarely shown)
const PlanApprovalModal = dynamic(
  () => import('@/components/ai-sidebar/PlanApprovalModal').then(m => ({ default: m.PlanApprovalModal })),
  { ssr: false }
);
const BatchDiffModal = dynamic(
  () => import('@/components/ai-sidebar/BatchDiffModal').then(m => ({ default: m.BatchDiffModal })),
  { ssr: false }
);
const ThemeReviewReportPanel = dynamic(
  () => import('@/components/ai-sidebar/ThemeReviewReport').then(m => ({ default: m.ThemeReviewReport })),
  { ssr: false }
);
const MemoryPanel = dynamic(
  () => import('@/components/features/memory/MemoryPanel').then(m => ({ default: m.MemoryPanel })),
  { ssr: false }
);
const CustomizerMode = dynamic(
  () => import('@/components/features/customizer/CustomizerMode').then(m => ({ default: m.CustomizerMode })),
  { ssr: false }
);

type ViewMode = 'editor' | 'canvas' | 'customize';

/** Map theme file path to storefront preview path via the template classifier. */
function previewPathFromFile(filePath: string | null | undefined): string {
  if (!filePath) return '/';
  if (!filePath.startsWith('templates/')) return '/';
  const entry = classifyTemplateFile(filePath);
  if (!entry) return '/';
  // Static templates return their base path; resource templates return '/' (need a resource)
  return entry.needsResource ? '/' : entry.previewBasePath;
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.projectId as string;

  const searchParams = useSearchParams();
  const [showHomeModal, setShowHomeModal] = useState(searchParams.get('home') === '1');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeActivity, setActiveActivity] = useState<import('@/components/editor/ActivityBar').ActivityPanel>('files');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<AnnotationData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activeFileContent, setActiveFileContent] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  // Tool card: preview path override (cleared when user navigates manually)
  const [previewPathOverride, setPreviewPathOverride] = useState<string | null>(null);

  // EPIC 15: View mode toggle (Editor / Canvas)
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // Preview tab — auto-open when preview is available
  const previewTabAutoOpenRef = useRef(false);

  // A5: ThemeConsole state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleTab, setConsoleTab] = useState<ThemeConsoleTab>('diagnostics');
  const [consoleEntries, setConsoleEntries] = useState<ThemeConsoleEntry[]>([]);

  // A7: Agent workflow modal state
  const [planApproval, setPlanApproval] = useState<{ steps: Array<{ number: number; description: string; complexity?: 'simple' | 'moderate' | 'complex' }> } | null>(null);
  const [batchDiff, setBatchDiff] = useState<{ title: string; entries: Array<{ fileId: string; fileName: string; originalContent: string; newContent: string; description?: string }> } | null>(null);
  const [themeReview, setThemeReview] = useState<ThemeReviewReportData | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [devReportOpen, setDevReportOpen] = useState(false);
  const [devReportPrePush, setDevReportPrePush] = useState(false);

  // A5: QuickActionsToolbar state
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [quickActionsPosition, setQuickActionsPosition] = useState({ top: 0, left: 0 });
  const [quickActionsText, setQuickActionsText] = useState('');

  // EPIC 5: Ref to send messages to agent chat (QuickActions, Fix with AI)
  const sendMessageRef = useRef<((content: string) => void) | null>(null);

  // Ref for AgentPromptPanel to expose recordApplyStats callback
  const onApplyStatsRef = useRef<((stats: { linesAdded: number; linesDeleted: number; filesAffected: number }) => void) | null>(null);

  // EPIC 14: Convention detection runs once per session when files + memory are ready
  const conventionDetectedRef = useRef(false);

  // A5: AmbientBar state
  const [ambientNudge, setAmbientNudge] = useState<AmbientNudge | null>(null);

  // A5: IntentCompletionPanel state
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowMatch | null>(null);

  // Panel sub-nav states (SectionNav active items)
  const [filesNav, setFilesNav] = useState('files');
  const [storeNav, setStoreNav] = useState('sync');
  const [qualityNav, setQualityNav] = useState('issues');
  const [historyNav, setHistoryNav] = useState('versions');

  const tabs = useFileTabs({ projectId });
  const { rawFiles } = useProjectFiles(projectId);
  const {
    projects,
    activeProjects,
    isLoading: isLoadingProjects,
    setLastProjectId,
    createProject,
    reconcile,
    restoreProject,
    isRestoring,
  } = useProjects();
  // useActiveStore is the primary source of truth for connection status (user-scoped).
  // useShopifyConnection provides sync/theme operations (project-scoped).
  const activeStore = useActiveStore(projectId);
  const shopify = useShopifyConnection(projectId);
  const { data: tokenData } = useDesignTokens(projectId);
  const devReport = useDevReport(projectId);
  const connected = !!activeStore.connection || shopify.connected;
  const connection = activeStore.connection
    ? {
        id: activeStore.connection.id,
        store_domain: activeStore.connection.store_domain,
        theme_id: activeStore.connection.theme_id,
        is_active: activeStore.connection.is_active,
        sync_status: activeStore.connection.sync_status,
        scopes: activeStore.connection.scopes,
        last_sync_at: activeStore.connection.last_sync_at,
        created_at: activeStore.connection.created_at,
        updated_at: activeStore.connection.updated_at,
      }
    : shopify.connection;
  const shopifyThemes = shopify.themes;

  const activeFile = useMemo(
    () => rawFiles.find((f) => f.id === tabs.activeFileId),
    [rawFiles, tabs.activeFileId]
  );
  const sidebar = useAISidebar({
    filePath: activeFile?.path ?? null,
    fileLanguage: activeFile?.file_type ?? null,
    selection: null,
  });

  const leftResize = useResizablePanel({
    storageKey: 'synapse-left-sidebar-width',
    defaultWidth: 256,
    minWidth: 180,
    maxWidth: 400,
  });

  const rightResize = useResizablePanel({
    storageKey: 'synapse-right-sidebar-width',
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 700,
  });

  const versionHistory = useVersionHistory(tabs.activeFileId ?? null);
  const diagnostics = useWorkspaceDiagnostics();

  // EPIC 15: Canvas dependency data (lazy-fetched only when canvas is active)
  const canvasData = useCanvasData(viewMode === 'canvas' ? projectId : null);

  // EPIC 11: Template layout for customizer mode (lazy-fetched only when customize is active)
  const templateLayout = useTemplateLayout(viewMode === 'customize' ? projectId : '');

  // Section content for customizer — enriched with Liquid file content for schema parsing
  const [enrichedSections, setEnrichedSections] = useState<
    Array<import('@/hooks/useTemplateLayout').TemplateSection & { content?: string }>
  >([]);
  const enrichedSectionsRef = useRef<string>('');

  useEffect(() => {
    if (viewMode !== 'customize' || !templateLayout.layout) {
      setEnrichedSections([]);
      enrichedSectionsRef.current = '';
      return;
    }
    const sections = templateLayout.layout.sections;
    const key = sections.map((s) => `${s.id}:${s.type}`).join(',');
    if (key === enrichedSectionsRef.current) return; // skip if unchanged
    enrichedSectionsRef.current = key;

    // Resolve section content asynchronously
    import('@/lib/customizer/section-resolver').then(({ resolveSectionContent }) =>
      resolveSectionContent(projectId, sections).then(setEnrichedSections),
    ).catch(() => {
      // Fallback: use sections without content
      setEnrichedSections(sections.map((s) => ({ ...s, content: undefined })));
    });
  }, [viewMode, templateLayout.layout, projectId]);

  // Passive IDE context reporter — always enabled for logged-in users
  const { user: authUser } = useAuth();
  const passiveContextEnabled = !!authUser;
  const activeSubNav = activeActivity === 'files' ? filesNav
    : activeActivity === 'store' ? storeNav
    : activeActivity === 'quality' ? qualityNav
    : activeActivity === 'history' ? historyNav
    : null;
  const passiveContext = usePassiveContext({
    enabled: passiveContextEnabled,
    activePanel: activeActivity,
    subNav: activeSubNav,
    viewMode,
    filePath: activeFile?.path ?? null,
    fileLanguage: activeFile?.file_type ?? null,
    selection: sidebar.context.selection ?? null,
  });

  // EPIC 14: Developer Memory
  const memory = useMemory(projectId);

  // EPIC 14: Convention detection — run once per session when files + memory are ready
  useEffect(() => {
    if (
      conventionDetectedRef.current ||
      rawFiles.length === 0 ||
      memory.isLoading
    ) {
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/files?include_content=true`
        );
        if (!res.ok) return;
        const json = await res.json();
        const filesWithContent = (json.data ?? []) as Array<{
          path: string;
          content?: string | null;
          file_type?: string;
        }>;
        const themeFiles: ThemeFile[] = filesWithContent.map((f) => ({
          path: f.path,
          content: f.content ?? '',
          fileType: (f.file_type ?? 'other') as ThemeFile['fileType'],
        }));
        const conventions = detectConventions(themeFiles);
        for (const dc of conventions) {
          if (dc.convention.confidence >= 0.6) {
            await memory.create(
              'convention',
              dc.convention,
              dc.convention.confidence
            );
          }
        }
        conventionDetectedRef.current = true;
      } catch {
        // Non-critical: avoid crashing on convention detection errors
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conventionDetectedRef guards re-runs; memory.create is stable
  }, [projectId, rawFiles.length, memory.isLoading, memory.create]);

  useEffect(() => {
    sidebar.updateContext({
      filePath: activeFile?.path ?? null,
      fileLanguage: activeFile?.file_type ?? null,
    });
  }, [activeFile?.path, activeFile?.file_type, sidebar.updateContext]);

  // EPIC 1c: Selection injection — track editor selection for AI context
  // (Also triggers QuickActionsToolbar — see handleEditorSelectionChange below)

  const recoveryAttemptedRef = useRef(false);

  const isCurrentProjectAccessible = useMemo(
    () => projects.some((p) => p.id === projectId),
    [projects, projectId]
  );

  // Reset recovery guard when project ID changes
  useEffect(() => {
    recoveryAttemptedRef.current = false;
  }, [projectId]);

  // Recover invalid/stale project URLs:
  // 1) Redirect to first accessible project when possible
  // 2) If user has no projects, auto-create an Untitled project
  // Note: only attempt recovery once per projectId to avoid loops
  useEffect(() => {
    if (isLoadingProjects || recoveryAttemptedRef.current) {
      return;
    }
    if (isCurrentProjectAccessible) {
      return;
    }

    recoveryAttemptedRef.current = true;

    if (projects.length > 0) {
      router.replace(`/projects/${projects[0].id}`);
      return;
    }

    // No projects found — but don't auto-create; we may have just
    // been redirected here from project creation. Just let the IDE load.
  }, [
    isLoadingProjects,
    isCurrentProjectAccessible,
    projects,
    router,
  ]);

  // Persist last-opened project only when it's valid for this user
  useEffect(() => {
    if (isCurrentProjectAccessible) {
      setLastProjectId(projectId);
    }
  }, [projectId, isCurrentProjectAccessible, setLastProjectId]);

  // Clean up ?home=1 from URL after opening the modal
  useEffect(() => {
    if (typeof window !== 'undefined' && searchParams.get('home') === '1') {
      const url = new URL(window.location.href);
      url.searchParams.delete('home');
      url.searchParams.delete('signed_in');
      window.history.replaceState({}, '', url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref for FileEditor to expose save/cancel imperatively
  const editorRef = useRef<FileEditorHandle>(null);

  // EPIC 1a: Ref for PreviewPanel to get DOM context for agent pipeline
  const previewRef = useRef<PreviewPanelHandle>(null);
  const getPreviewSnapshot = useCallback(async () => {
    if (!previewRef.current) return '';
    return previewRef.current.getDOMContext(3000);
  }, []);

  // EPIC V3: Preview verification — before/after DOM snapshot comparison
  const { captureBeforeSnapshot, verify: verifyPreview } = usePreviewVerification(previewRef);

  // Phase 4a: Live preview hot-reload
  const [livePreviewState, livePreviewActions] = useLivePreview();
  const handleLiveChange = useCallback((change: { filePath: string; newContent: string }) => {
    livePreviewActions.pushChange({ ...change, appliedAt: Date.now() });
    // Inject CSS changes immediately into preview
    const css = livePreviewActions.getAggregatedCSS();
    if (css && previewRef.current) {
      previewRef.current.injectCSS(css);
    }
  }, [livePreviewActions]);
  const handleLiveSessionEnd = useCallback(() => {
    livePreviewActions.endSession();
    // Clear injected CSS after session — user reviews actual changes via ReviewBlock
    previewRef.current?.clearCSS();
  }, [livePreviewActions]);

  // Cmd/Ctrl+Shift+A: focus agent chat; Ctrl+P: command palette
  const agentChatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        agentChatRef.current?.querySelector('textarea')?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for element-selected messages from the preview bridge
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (
        msg?.type === 'synapse-bridge-response' &&
        msg?.action === 'element-selected' &&
        msg?.data
      ) {
        setSelectedElement(msg.data as SelectedElement);
        // Auto-focus agent chat so the user can type a command
        agentChatRef.current?.querySelector('textarea')?.focus();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const activeFilePath = useMemo(
    () =>
      tabs.activeFileId
        ? rawFiles.find((f) => f.id === tabs.activeFileId)?.path
        : undefined,
    [tabs.activeFileId, rawFiles]
  );

  // Clear preview path override when user manually navigates away from the preview tab
  useEffect(() => {
    if (tabs.activeFileId && tabs.activeFileId !== PREVIEW_TAB_ID && previewPathOverride) {
      setPreviewPathOverride(null);
    }
  }, [tabs.activeFileId, previewPathOverride]);

  const presence = useWorkspacePresence(projectId, {
    filePath: activeFilePath ?? undefined,
  });
  const allCursors = useRemoteCursors({ workspaceId: projectId });
  const cursorsForActiveFile = useMemo(
    () =>
      activeFilePath
        ? allCursors.filter((c) => c.filePath === activeFilePath)
        : [],
    [allCursors, activeFilePath]
  );

  // Preview theme resolution (instant preview optimization):
  // 1. If dev_theme_id exists AND sync is complete → use dev theme (edits are live)
  // 2. Otherwise, use the source theme (shopify_theme_id) for instant preview
  // 3. Fall back to connection.theme_id for backward compat
  const currentProject = projects.find((p) => p.id === projectId);
  const devThemeReady =
    currentProject?.dev_theme_id && connection?.sync_status === 'connected';
  const previewThemeId = devThemeReady
    ? currentProject.dev_theme_id
    : currentProject?.shopify_theme_id ??
      currentProject?.dev_theme_id ??
      connection?.theme_id ??
      null;
  const showPreview = connected && connection && !!previewThemeId;
  const isPreviewUsingSourceTheme =
    !!previewThemeId &&
    !devThemeReady &&
    previewThemeId === (currentProject?.shopify_theme_id ?? null);

  // Auto-open preview tab when preview becomes available (once)
  const openPreviewTab = tabs.openPreviewTab;
  useEffect(() => {
    if (showPreview && !previewTabAutoOpenRef.current) {
      previewTabAutoOpenRef.current = true;
      openPreviewTab();
    }
  }, [showPreview, openPreviewTab]);

  const hasFiles = rawFiles.length > 0;

  // ── Auto-reconcile on mount (once per browser session) ────────────────────
  const reconcileTriggeredRef = useRef(false);
  const [undoToast, setUndoToast] = useState<{
    message: string;
    archivedIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!connected || isLoadingProjects || reconcileTriggeredRef.current) return;
    // Once per session guard
    if (typeof window !== 'undefined' && sessionStorage.getItem('synapse-reconciled')) {
      reconcileTriggeredRef.current = true;
      return;
    }

    reconcileTriggeredRef.current = true;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('synapse-reconciled', '1');
    }

    reconcile()
      .then((result: ReconcileResult) => {
        if (result.archived > 0) {
          const names =
            result.archivedProjectNames.length > 0
              ? result.archivedProjectNames.join(', ')
              : `${result.archived} theme(s)`;
          setUndoToast({
            message: `${names} archived — dev themes removed from Shopify`,
            archivedIds: result.archivedProjectIds,
          });

          // If current project was just archived, redirect to first active
          if (result.archivedProjectIds.includes(projectId)) {
            const remaining = activeProjects.filter(
              (p) => !result.archivedProjectIds.includes(p.id)
            );
            if (remaining.length > 0) {
              router.replace(`/projects/${remaining[0].id}`);
            } else {
              router.replace('/projects');
            }
          }
        }

        if (result.restored > 0) {
          setToast(`${result.restored} theme(s) restored`);
          setTimeout(() => setToast(null), 4000);
        }
      })
      .catch(() => {
        // Reconcile failure is non-critical
      });
  }, [connected, isLoadingProjects, reconcile, projectId, activeProjects, router]);

  // Handle undo of archive (set projects back to active)
  const handleUndoArchive = useCallback(async () => {
    if (!undoToast) return;
    // Undo: restore each archived project, then trigger background file push
    for (const id of undoToast.archivedIds) {
      try {
        await restoreProject(id);
        // Trigger background dev theme push (fire-and-forget)
        fetch(`/api/projects/${id}/sync-dev-theme`, { method: 'POST' }).catch(() => {});
      } catch {
        // Continue with remaining
      }
    }
    setUndoToast(null);
  }, [undoToast, restoreProject]);

  // Is the current project archived?
  const isProjectArchived = currentProject?.status === 'archived';

  // Handle "Sync Now" for archived banner
  const [bannerRestoring, setBannerRestoring] = useState(false);
  const handleBannerRestore = useCallback(async () => {
    setBannerRestoring(true);
    try {
      await restoreProject(projectId);
      // Trigger background dev theme push (same deferred pattern as import)
      fetch(`/api/projects/${projectId}/sync-dev-theme`, { method: 'POST' }).catch(() => {});
      setToast('Theme restored — syncing files to Shopify…');
      setTimeout(() => setToast(null), 5000);
    } catch (err) {
      console.error('Restore failed', err);
      setToast('Restore failed — Shopify may have reached the theme limit');
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBannerRestoring(false);
    }
  }, [projectId, restoreProject]);

  // Handle "Switch Project" from archived banner
  const handleSwitchToActive = useCallback(() => {
    if (activeProjects.length > 0) {
      router.push(`/projects/${activeProjects[0].id}`);
    } else {
      router.push('/projects');
    }
  }, [activeProjects, router]);

  // ── Presence heartbeat ────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/v1/workspaces/${projectId}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        file_path: activeFilePath ?? null,
        state: 'active',
      }),
    }).catch(() => {});
  }, [projectId, activeFilePath]);

  const fileMetaMap = new Map(
    rawFiles.map((f) => [f.id, { id: f.id, name: f.name }])
  );

  const refreshFiles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
  }, [projectId, queryClient]);

  // ── Smart file opening: related files map ──────────────────────────────
  const relatedFilesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    // Auto-detected groups from theme structure (exclude catch-all "Other files" group)
    const groups = generateFileGroups(rawFiles.map((f) => ({ id: f.id, name: f.name, path: f.path })));
    for (const group of groups) {
      if (group.id === 'group-other') continue; // skip the catch-all
      for (const fid of group.fileIds) {
        const others = group.fileIds.filter((id) => id !== fid);
        const existing = map.get(fid) ?? [];
        map.set(fid, [...new Set([...existing, ...others])]);
      }
    }
    // Merge manual links
    for (const f of rawFiles) {
      const manual = getLinkedFileIds(projectId, f.id);
      if (manual.length > 0) {
        const existing = map.get(f.id) ?? [];
        map.set(f.id, [...new Set([...existing, ...manual])]);
      }
    }
    return map;
  }, [rawFiles, projectId]);

  const [relatedPrompt, setRelatedPrompt] = useState<{
    triggerFileId: string;
    triggerFileName: string;
    relatedFiles: RelatedFileInfo[];
  } | null>(null);

  const handleAddFile = () => setUploadModalOpen(true);
  const handleUploadSuccess = () => {
    refreshFiles();
    setToast('File added');
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileClick = (fileId: string) => {
    tabs.openTab(fileId);

    // Smart open: check for related files
    const related = relatedFilesMap.get(fileId) ?? [];
    const notYetOpen = related.filter((id) => !tabs.openTabs.includes(id));
    if (notYetOpen.length > 0) {
      const clickedFile = rawFiles.find((f) => f.id === fileId);
      const groupKey = clickedFile?.path ?? fileId;
      if (!isDismissed(projectId, groupKey)) {
        const relatedInfo: RelatedFileInfo[] = notYetOpen
          .map((id) => rawFiles.find((f) => f.id === id))
          .filter(Boolean)
          .map((f) => ({ id: f!.id, name: f!.name, path: f!.path }));
        if (relatedInfo.length > 0) {
          setRelatedPrompt({
            triggerFileId: fileId,
            triggerFileName: clickedFile?.name ?? 'file',
            relatedFiles: relatedInfo,
          });
        }
      }
    } else {
      setRelatedPrompt(null);
    }
  };

  const handleMarkDirty = useCallback(
    (dirty: boolean) => {
      const { activeFileId, markUnsaved } = tabs;
      if (activeFileId) markUnsaved(activeFileId, dirty);
    },
    [tabs]
  );

  const handleTabClose = (fileId: string) => {
    tabs.closeTab(fileId);
  };

  // ── Project switching ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSwitchProject = useCallback((newProjectId: string) => {
    router.push(`/projects/${newProjectId}`);
  }, [router]);

  const handleCreateProject = useCallback(async () => {
    try {
      const result = await createProject({ name: 'Untitled project' });
      router.push(`/projects/${result.id}`);
    } catch {
      // Silently fail — project list will still be accessible
    }
  }, [createProject, router]);

  const handleOpenImport = () => {
    setImportModalOpen(true);
  };

  // ── Push to Shopify ──────────────────────────────────────────────────────
  const handlePush = useCallback(async () => {
    try {
      await shopify.sync({ action: 'push' });
      devReport.reset();
      setDevReportOpen(false);
      setDevReportPrePush(false);
      setToast('Pushed to Shopify');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(`Push failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setToast(null), 5000);
    }
  }, [shopify, devReport]);

  // ── Import success — generate worksets ─────────────────────────────────────
  const handleImportSuccess = () => {
    refreshFiles();
    setToast('Theme imported successfully');
    setTimeout(() => setToast(null), 3000);

    // Generate grouped worksets from imported files after a short delay
    // to let the file list refresh complete
    setTimeout(() => {
      const filesWithContent = rawFiles.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        content: undefined, // Content loaded lazily; grouping uses path patterns
      }));

      if (filesWithContent.length > 0) {
        const groups = generateFileGroups(filesWithContent);
        if (groups.length > 0) {
          tabs.setGroups(groups);
          tabs.openGroup(groups[0].id);
        }
      }
    }, 1500);
  };

  // ── EPIC 3: Active file content change handler ─────────────────────────────
  const handleContentChange = useCallback((content: string) => {
    setActiveFileContent(content);
  }, []);

  // ── Derived state for Save + Lock in FileTabs ──────────────────────────────
  const isActiveFileDirty = tabs.activeFileId ? tabs.unsavedFileIds.has(tabs.activeFileId) : false;
  const isActiveFileLocked = tabs.activeFileId ? tabs.isLocked(tabs.activeFileId) : false;
  const handleSaveActiveFile = useCallback(() => {
    editorRef.current?.save();
  }, []);
  const handleLockToggle = useCallback(() => {
    if (tabs.activeFileId) tabs.toggleLock(tabs.activeFileId);
  }, [tabs]);

  // EPIC 2: Provide active file content for [RETRY_WITH_FULL_CONTEXT]
  const activeFileContentRef = useRef('');
  useEffect(() => {
    activeFileContentRef.current = activeFileContent;
  }, [activeFileContent]);
  const getActiveFileContent = useCallback(() => {
    return activeFileContentRef.current || null;
  }, []);

  // Open file by path (from AI response file chips)
  const handleOpenFile = useCallback((filePath: string) => {
    const fileId = resolveFileId(filePath, rawFiles);
    if (fileId) {
      tabs.openTab(fileId);
    }
  }, [rawFiles, tabs]);

  // Resolve file path to fileId (for code block Apply)
  const handleResolveFileId = useCallback((filePath: string) => {
    return resolveFileId(filePath, rawFiles);
  }, [rawFiles]);

  // Phase 2: Resolve file path to its cached content (for diff views)
  const handleResolveFileContent = useCallback((filePath: string) => {
    const fileId = resolveFileId(filePath, rawFiles);
    if (!fileId) return null;
    const cached = queryClient.getQueryData<{ id: string; content: string }>(['file', fileId]);
    return cached?.content ?? null;
  }, [rawFiles, queryClient]);

  // ── Tool card handlers (passed to AgentPromptPanel -> ChatInterface) ──

  /** Open a plan file in the editor by path. Falls back to handleOpenFile. */
  const handleOpenPlanFile = useCallback((filePath: string) => {
    handleOpenFile(filePath);
  }, [handleOpenFile]);

  /** Navigate the preview panel to a specific path (from navigate_preview tool). */
  const handleNavigatePreview = useCallback((path: string) => {
    setPreviewPathOverride(path);
    // Auto-switch to preview tab so user sees the navigation
    if (tabs.activeFileId !== PREVIEW_TAB_ID) {
      tabs.openTab(PREVIEW_TAB_ID);
    }
  }, [tabs]);

  /** Create a new file from create_file tool, then open it in a tab. */
  const handleConfirmFileCreate = useCallback(async (fileName: string, content: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, content, fileType: 'liquid' }),
      });
      if (!res.ok) {
        console.error('[handleConfirmFileCreate] Failed to create file:', await res.text());
        return;
      }
      const json = await res.json();
      const newFileId = json?.data?.id;

      // Refresh files list so the tree picks it up
      refreshFiles();

      // Open the new file in a tab
      if (newFileId) {
        setTimeout(() => tabs.openTab(newFileId), 300);
      }
    } catch (err) {
      console.error('[handleConfirmFileCreate] Error:', err);
    }
  }, [projectId, refreshFiles, tabs]);

  // Handle applying code from AI response to an existing file
  const handleApplyCode = useCallback(async (code: string, fileId: string, _fileName: string) => {
    try {
      // 1. Fetch current file content for diff
      const getRes = await fetch(`/api/files/${fileId}`);
      const oldContent = getRes.ok ? ((await getRes.json())?.data?.content ?? '') : '';

      // 2. Update file with new content
      const putRes = await fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      });
      if (!putRes.ok) {
        console.error('[handleApplyCode] Failed to update file');
        return;
      }

      // 3. Refresh files
      refreshFiles();

      // 4. Compute diff and report stats (non-blocking)
      const diff = analyzeDiff(oldContent, code);
      onApplyStatsRef.current?.({
        linesAdded: diff.added + diff.modified,
        linesDeleted: diff.removed + diff.modified,
        filesAffected: 1,
      });
    } catch (err) {
      console.error('[handleApplyCode] Error:', err);
    }
  }, [refreshFiles]);

  // Handle saving a new file from AI response
  const handleSaveCode = useCallback(async (code: string, fileName: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, path: fileName, content: code }),
      });
      if (!res.ok) {
        console.error('[handleSaveCode] Failed to create file');
        return;
      }

      refreshFiles();

      // Report stats for new file (non-blocking)
      onApplyStatsRef.current?.({
        linesAdded: code.split('\n').length,
        linesDeleted: 0,
        filesAffected: 1,
      });
    } catch (err) {
      console.error('[handleSaveCode] Error:', err);
    }
  }, [projectId, refreshFiles]);

  // EPIC 2: Token usage handler
  const handleTokenUsage = useCallback((usage: TokenUsage) => {
    setTokenUsage(usage);
  }, []);

  // A5: Console clear handler
  const handleConsoleClear = useCallback(() => {
    setConsoleEntries([]);
  }, []);

  // A5: QuickActions — update selection info from editor selection changes
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const handleEditorSelectionForToolbar = useCallback((selectedText: string | null) => {
    // Forward to AI sidebar context as before
    sidebar.updateContext({ selection: selectedText });
    // Show/hide quick actions toolbar
    if (selectedText && selectedText.length > 2) {
      setQuickActionsText(selectedText);
      setQuickActionsVisible(true);
      // Position is set by handleSelectionPosition below; keep current if available
    } else {
      setQuickActionsVisible(false);
    }
  }, [sidebar]);

  // Selection position handler — receives coords from Monaco via FileEditor
  const handleSelectionPosition = useCallback((pos: { top: number; left: number; text: string } | null) => {
    if (!pos) return;
    // Flip logic: if too close to top, show below the selection instead of above
    const top = pos.top < 50 ? pos.top + 20 : pos.top;
    setQuickActionsPosition({ top, left: pos.left });
  }, []);

  // EPIC 1c + A5: Combined selection handler
  const handleEditorSelectionChange = useCallback((selectedText: string | null) => {
    handleEditorSelectionForToolbar(selectedText);
  }, [handleEditorSelectionForToolbar]);

  // A5: QuickActions — send prompt to agent chat
  const handleQuickAction = useCallback((prompt: string) => {
    setQuickActionsVisible(false);
    sendMessageRef.current?.(prompt);
    agentChatRef.current?.querySelector('textarea')?.focus();
  }, []);

  // EPIC 5: Fix with AI — send diagnostic to agent chat
  const handleFixWithAI = useCallback((diagnostic: string, line: number) => {
    sidebar.updateContext({ selection: diagnostic });
    const prompt = `Fix this Liquid diagnostic on line ${line}: ${diagnostic}`;
    sendMessageRef.current?.(prompt);
    agentChatRef.current?.querySelector('textarea')?.focus();
  }, [sidebar]);

  // A5: AmbientBar handlers
  const handleAmbientAccept = useCallback((_nudgeId: string) => {
    // Future: trigger resolution action
    setAmbientNudge(null);
  }, []);
  const handleAmbientDismiss = useCallback((_nudgeId: string) => {
    setAmbientNudge(null);
  }, []);

  // A5: IntentCompletionPanel handlers (no-op stubs; workflow engine not yet connected)
  const handleWorkflowToggleStep = useCallback((_stepId: string) => {}, []);
  const handleWorkflowApplyStep = useCallback((_stepId: string) => {}, []);
  const handleWorkflowApplyAll = useCallback(() => {}, []);
  const handleWorkflowPreviewAll = useCallback(() => {}, []);
  const handleWorkflowDismiss = useCallback(() => {
    setActiveWorkflow(null);
  }, []);

  // ── EPIC 3: Snippet usage counting (path-based via theme grouping) ──────
  const snippetUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const snippetFiles = rawFiles.filter((f) => f.path.startsWith('snippets/'));
    if (snippetFiles.length === 0) return counts;

    for (const snippet of snippetFiles) {
      // Count non-snippet files that reference this snippet (via relatedFilesMap)
      const related = relatedFilesMap.get(snippet.id) ?? [];
      const refCount = related.filter((id) => {
        const f = rawFiles.find((r) => r.id === id);
        return f && !f.path.startsWith('snippets/');
      }).length;
      if (refCount > 0) {
        counts.set(snippet.id, refCount);
      }
    }
    return counts;
  }, [rawFiles, relatedFilesMap]);

  // ── A6: Command palette commands ──────────────────────────────────────────
  const paletteCommands: PaletteCommand[] = useMemo(() => [
    // Commands
    { id: 'theme-review', category: 'command', label: 'Run Theme Review', action: () => {} },
    { id: 'toggle-console', category: 'command', label: 'Toggle Console', action: () => setConsoleOpen(prev => !prev) },
    { id: 'push-shopify', category: 'command', label: 'Push to Shopify', action: () => {} },
    { id: 'pull-shopify', category: 'command', label: 'Pull from Shopify', action: () => {} },
    { id: 'export-theme', category: 'command', label: 'Export Theme ZIP', action: () => {} },
    { id: 'memory', category: 'command', label: 'Open Memory Panel', action: () => setMemoryOpen(true) },

    // Navigation
    { id: 'nav-files', category: 'navigation', label: 'Go to Files', action: () => { setActiveActivity('files'); setFilesNav('files'); } },
    { id: 'nav-assets', category: 'navigation', label: 'Go to Assets', action: () => { setActiveActivity('files'); setFilesNav('assets'); } },
    { id: 'nav-templates', category: 'navigation', label: 'Go to Templates', action: () => { setActiveActivity('files'); setFilesNav('templates'); } },
    { id: 'nav-store-sync', category: 'navigation', label: 'Go to Store > Sync', action: () => { setActiveActivity('store'); setStoreNav('sync'); } },
    { id: 'nav-store-content', category: 'navigation', label: 'Go to Store > Content', action: () => { setActiveActivity('store'); setStoreNav('content'); } },
    { id: 'nav-store-publish', category: 'navigation', label: 'Go to Store > Publish', action: () => { setActiveActivity('store'); setStoreNav('publish'); } },
    { id: 'nav-design', category: 'navigation', label: 'Go to Design Tokens', action: () => { setActiveActivity('design'); } },
    { id: 'nav-quality-issues', category: 'navigation', label: 'Go to Quality > Issues', action: () => { setActiveActivity('quality'); setQualityNav('issues'); } },
    { id: 'nav-quality-a11y', category: 'navigation', label: 'Go to Accessibility', action: () => { setActiveActivity('quality'); setQualityNav('a11y'); } },

    // Account
    { id: 'account-overview', category: 'account', label: 'Open Account Overview', action: () => window.open('/account', '_blank') },
    { id: 'account-usage', category: 'account', label: 'Open Usage', action: () => window.open('/account/usage', '_blank') },
    { id: 'account-billing', category: 'account', label: 'Open Billing', action: () => window.open('/account/billing', '_blank') },
    { id: 'account-settings', category: 'account', label: 'Open Settings', action: () => window.open('/account/settings', '_blank') },
  ], []);

  // ── EPIC 3: File list for command palette ─────────────────────────────────
  const commandPaletteFiles = useMemo(
    () => rawFiles.map((f) => ({ id: f.id, name: f.name, path: f.path })),
    [rawFiles]
  );

  // ── Group tab handlers ────────────────────────────────────────────────────
  const handleGroupSelect = (groupId: string) => {
    if (groupId === '__all__') {
      tabs.switchGroup('');
    } else {
      tabs.switchGroup(groupId);
    }
  };

  return (
    <ChromaticSettingsProvider>
    <EditorSettingsProvider>
    <div className="flex h-screen flex-col ide-surface ide-text">
      {/* Login transition overlay (activates when ?signed_in=1 is present) */}
      <Suspense fallback={null}>
        <LoginTransition />
      </Suspense>

      {/* ── Connection status banner (authenticated IDE) ─────────────────── */}
      {!connected && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 ide-surface-panel border-b ide-border ide-text-2 text-xs">
          <span className="font-medium">No store connected</span>
          <span className="ide-text-3">&mdash;</span>
          <span>Import a theme or connect Shopify to enable live preview sync.</span>
          <button
            type="button"
            onClick={handleOpenImport}
            className="ml-2 underline ide-text-2 hover:ide-text transition-colors"
          >
            Import or connect
          </button>
        </div>
      )}

      {/* ── Archived project banner ─────────────────────────────────────────── */}
      {isProjectArchived && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/40 text-amber-800 dark:text-amber-200 text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">
            This theme&apos;s dev copy was removed from Shopify.{' '}
            <span className="text-amber-700/80 dark:text-amber-300/70">Your files are safe.</span>
          </span>
          <button
            type="button"
            onClick={handleBannerRestore}
            disabled={bannerRestoring || isRestoring}
            className="px-3 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bannerRestoring ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
                Syncing…
              </>
            ) : (
              'Sync Now'
            )}
          </button>
          <button
            type="button"
            onClick={handleSwitchToActive}
            className="px-3 py-1 text-xs ide-text-2 hover:ide-text ide-hover rounded transition-colors"
          >
            Switch Project
          </button>
        </div>
      )}

      {/* ── Top Bar (push/pull, view toggle, command palette, user menu) ── */}
      <TopBar
        onPush={async () => {
          // If there are pending report changes, show the report with a pre-push warning
          if (devReport.activated && devReport.data && devReport.data.summary.totalFiles > 0) {
            setDevReportPrePush(true);
            setDevReportOpen(true);
            return;
          }
          await handlePush();
        }}
        onPull={async () => {
          try {
            await shopify.sync({ action: 'pull' });
            refreshFiles();
            setToast('Pulled from Shopify');
            setTimeout(() => setToast(null), 3000);
          } catch (err) {
            setToast(`Pull failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setTimeout(() => setToast(null), 5000);
          }
        }}
        syncStatus={connected ? (connection?.sync_status === 'syncing' ? 'syncing' : connection?.sync_status === 'error' ? 'error' : 'idle') : 'idle'}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCommandPalette={() => setCommandPaletteOpen((prev) => !prev)}
        storeDomain={connection?.store_domain ?? null}
        connected={connected}
        themeId={previewThemeId}
        devReport={devReport.data?.summary ?? null}
        isLoadingReport={devReport.isLoading}
        onOpenReport={() => {
          if (!devReport.data) devReport.refresh();
          setDevReportOpen(true);
        }}
        onRefreshReport={devReport.refresh}
        presence={presence}
        onHomeClick={() => setShowHomeModal(true)}
      />

      {/* Toast notification overlay */}
      {toast && (
        <div className="absolute top-14 right-4 z-50">
          <span className="text-sm text-accent animate-pulse ide-surface-pop px-3 py-1.5 rounded-md border ide-border">
            {toast}
          </span>
        </div>
      )}

      {/* ── Main 4-column layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Col 1: Activity Bar (icon rail) — hidden in customize mode ── */}
        {viewMode !== 'customize' && (
          <ActivityBar
            activePanel={activeActivity}
            onPanelChange={setActiveActivity}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        )}

        {/* ── Col 2: Left Panel (dynamic by activeActivity) ──────────────── */}
        {viewMode !== 'customize' && activeActivity !== null && (
          <aside
            className="relative border-r ide-border-subtle flex-shrink-0 flex flex-col min-h-0 ide-surface"
            style={{ width: leftResize.width }}
          >
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* ── Files panel ─────────────────────────────────────────── */}
              {activeActivity === 'files' && (
                <>
                  <SectionNav
                    title={currentProject?.name ?? 'Files'}
                    sections={[{ header: 'Theme', items: [
                      { id: 'files', label: 'Files' },
                      { id: 'assets', label: 'Assets' },
                      { id: 'templates', label: 'Templates' },
                    ]}]}
                    activeItem={filesNav}
                    onItemClick={setFilesNav}
                    headerActions={
                      filesNav === 'files' ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleOpenImport}
                            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium ide-text-muted hover:ide-text ide-hover rounded transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            Import
                          </button>
                          <button
                            type="button"
                            onClick={handleAddFile}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium ide-text-muted hover:ide-text ide-hover rounded transition-colors"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M5 1v8M1 5h8" />
                            </svg>
                            Add
                          </button>
                        </div>
                      ) : undefined
                    }
                  />
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {filesNav === 'files' && (
                      <>
                        {hasFiles ? (
                          <FileList
                            projectId={projectId}
                            onFileClick={handleFileClick}
                            onAddFile={handleAddFile}
                            presence={presence}
                            snippetUsageCounts={snippetUsageCounts}
                            activeFileId={tabs.activeFileId ?? null}
                            activeFileContent={activeFileContent || null}
                            activeFilePath={activeFile?.path ?? null}
                            activeFileType={(activeFile?.file_type ?? null) as string | null}
                          />
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-end pb-8 px-4 text-center">
                            <div className="w-12 h-12 mb-3 rounded-lg ide-surface-input border ide-border-subtle flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 ide-text-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                              </svg>
                            </div>
                            <p className="text-sm ide-text-muted font-medium">No theme loaded</p>
                            <p className="text-xs ide-text-3 mt-1">Import a theme to get started</p>
                          </div>
                        )}
                      </>
                    )}
                    {filesNav === 'assets' && (
                      connected && connection?.id && connection?.theme_id ? (
                        <AssetBrowserPanel connectionId={connection.id} themeId={Number(connection.theme_id)} storeDomain={connection.store_domain} />
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-4 text-sm ide-text-3">Connect a Shopify store to browse assets.</div>
                      )
                    )}
                    {filesNav === 'templates' && (
                      <TemplateComposer projectId={projectId} />
                    )}
                  </div>
                </>
              )}

              {/* ── Search panel ────────────────────────────────────────── */}
              {activeActivity === 'search' && (
                <SearchPanel
                  projectId={projectId}
                  onFileClick={handleFileClick}
                  presence={presence}
                  snippetUsageCounts={snippetUsageCounts}
                />
              )}

              {/* ── Store panel ─────────────────────────────────────────── */}
              {activeActivity === 'store' && (
                <>
                  <SectionNav
                    title="Store"
                    sections={[{ header: 'Connection', items: [
                      { id: 'sync', label: 'Sync' },
                      { id: 'content', label: 'Content' },
                      { id: 'publish', label: 'Publish' },
                    ]}]}
                    activeItem={storeNav}
                    onItemClick={setStoreNav}
                  />
                  <div className="flex-1 flex flex-col min-h-0 overflow-auto">
                    {storeNav === 'sync' && (
                      <div className="flex-1 overflow-auto p-2">
                        <ShopifyConnectPanel projectId={projectId} />
                      </div>
                    )}
                    {storeNav === 'content' && (
                      connected && connection?.id ? (
                        <MetafieldExplorer connectionId={connection.id} />
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-4 text-sm ide-text-3">Connect a Shopify store to manage metafields.</div>
                      )
                    )}
                    {storeNav === 'publish' && (
                      connected && connection?.id ? (
                        <PublishRequestPanel projectId={projectId} currentUserId={authUser?.id ?? ''} userRole="owner" themes={(shopifyThemes ?? []).map(t => ({ id: t.id, name: t.name, role: t.role }))} />
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-4 text-sm ide-text-3">Connect a Shopify store to manage publish requests.</div>
                      )
                    )}
                  </div>
                </>
              )}

              {/* ── Design panel (summary + link to Design System page) ── */}
              {activeActivity === 'design' && (
                <>
                  <div className="flex items-center px-4 py-2.5 border-b ide-border-subtle shrink-0">
                    <span className="text-[13px] font-semibold ide-text">Design System</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-4">
                    <div className="space-y-1">
                      <p className="text-sm ide-text-2">
                        {tokenData ? `${tokenData.tokenCount} tokens found` : 'No tokens yet'}
                      </p>
                      <p className="text-xs ide-text-muted">
                        Explore tokens, components, and cleanup suggestions
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`/projects/${projectId}/design-system`)}
                      className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                    >
                      Open Design System
                    </button>
                  </div>
                </>
              )}

              {/* ── Quality panel ───────────────────────────────────────── */}
              {activeActivity === 'quality' && (
                <>
                  <SectionNav
                    title="Quality"
                    sections={[{ header: 'Analysis', items: [
                      { id: 'issues', label: 'Issues' },
                      { id: 'performance', label: 'Performance' },
                      { id: 'a11y', label: 'Accessibility' },
                      { id: 'images', label: 'Images' },
                    ]}]}
                    activeItem={qualityNav}
                    onItemClick={setQualityNav}
                  />
                  <div className="flex-1 flex flex-col min-h-0 overflow-auto">
                    {qualityNav === 'issues' && (
                      <div className="flex-1 overflow-auto p-2 space-y-3">
                        <SuggestionPanel projectId={projectId} fileId={tabs.activeFileId ?? undefined} />
                        <DiagnosticsPanel files={diagnostics.files} />
                      </div>
                    )}
                    {qualityNav === 'performance' && (
                      <div className="flex-1 overflow-auto p-2">
                        <PerformanceDashboard files={[]} />
                      </div>
                    )}
                    {qualityNav === 'a11y' && (
                      <div className="flex-1 overflow-auto p-2">
                        <A11yPanel html="" />
                      </div>
                    )}
                    {qualityNav === 'images' && (
                      <div className="flex-1 overflow-auto p-2">
                        <ImageOptPanel files={[]} />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── History panel ───────────────────────────────────────── */}
              {activeActivity === 'history' && (
                <>
                  <SectionNav
                    title="History"
                    sections={[{ header: 'Timeline', items: [
                      { id: 'versions', label: 'Versions' },
                      { id: 'push-log', label: 'Push Log' },
                    ]}]}
                    activeItem={historyNav}
                    onItemClick={setHistoryNav}
                  />
                  <div className="flex-1 flex flex-col min-h-0 overflow-auto">
                    {historyNav === 'versions' && (
                      <div className="flex-1 overflow-auto p-2">
                        <VersionHistoryPanel
                          versions={versionHistory.versions}
                          currentVersion={
                            versionHistory.versions.length > 0
                              ? Math.max(...versionHistory.versions.map((v) => v.version_number))
                              : 0
                          }
                          isLoading={versionHistory.isLoading}
                          onUndo={(n) => versionHistory.undo({ current_version_number: n })}
                          onRedo={(n) => versionHistory.redo({ current_version_number: n })}
                          onRestore={(versionId) =>
                            versionHistory.restore({
                              version_id: versionId,
                              current_version_number:
                                versionHistory.versions.length > 0
                                  ? Math.max(...versionHistory.versions.map((v) => v.version_number))
                                  : 0,
                            })
                          }
                          isUndoing={versionHistory.isUndoing}
                          isRedoing={versionHistory.isRedoing}
                          isRestoring={versionHistory.isRestoring}
                        />
                      </div>
                    )}
                    {historyNav === 'push-log' && (
                      <div className="p-4 ide-text-3 text-sm">Push log coming soon</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <ResizeHandle
              side="right"
              minWidth={leftResize.minWidth}
              maxWidth={leftResize.maxWidth}
              currentWidth={leftResize.width}
              onResize={leftResize.setWidth}
              onDoubleClick={leftResize.resetWidth}
            />
          </aside>
        )}

        {/* ── Col 3: Center — File tabs + Editor / Canvas ────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* A5: AmbientBar — proactive nudge above file tabs */}
          {viewMode === 'editor' && (
            <AmbientBar
              nudge={ambientNudge}
              onAccept={handleAmbientAccept}
              onDismiss={handleAmbientDismiss}
            />
          )}

          {/* File tabs (editor view only) */}
          {viewMode === 'editor' && (
            <div className="flex items-center border-b ide-border-subtle ide-surface-panel">
              <div className="flex-1 min-w-0">
                <FileTabs
                  openTabs={tabs.openTabs}
                  activeFileId={tabs.activeFileId}
                  unsavedFileIds={tabs.unsavedFileIds}
                  lockedFileIds={tabs.lockedFileIds}
                  fileMetaMap={fileMetaMap}
                  onTabSelect={tabs.switchTab}
                  onTabClose={handleTabClose}
                  onAddFile={handleAddFile}
                  onNextTab={tabs.nextTab}
                  onPrevTab={tabs.prevTab}
                  tabGroups={tabs.tabGroups}
                  activeGroupId={tabs.activeGroupId}
                  onGroupSelect={handleGroupSelect}
                  onGroupClose={tabs.closeGroup}
                  onReorderTabs={tabs.reorderTabs}
                  previewTabOpen={tabs.previewTabOpen}
                  onClosePreviewTab={tabs.closePreviewTab}
                  isActiveFileDirty={isActiveFileDirty}
                  isActiveFileLocked={isActiveFileLocked}
                  onSaveClick={handleSaveActiveFile}
                  onLockToggle={handleLockToggle}
                />
              </div>
            </div>
          )}

          {/* ── Editor view ────────────────────────────────────────────── */}
          {viewMode === 'editor' && (
            <>
              {/* Related files prompt */}
              {relatedPrompt && (
                <div className="px-2 pt-1">
                  <RelatedFilesPrompt
                    triggerFileName={relatedPrompt.triggerFileName}
                    relatedFiles={relatedPrompt.relatedFiles}
                    onOpenFile={(fid) => {
                      tabs.openTab(fid);
                      setRelatedPrompt(null);
                    }}
                    onOpenAll={(fids) => {
                      tabs.openMultiple(fids);
                      setRelatedPrompt(null);
                    }}
                    onDismiss={() => {
                      const clickedFile = rawFiles.find((f) => f.id === relatedPrompt.triggerFileId);
                      if (clickedFile) dismissGroup(projectId, clickedFile.path);
                      setRelatedPrompt(null);
                    }}
                    onLinkFiles={() => {
                      const allIds = [relatedPrompt.triggerFileId, ...relatedPrompt.relatedFiles.map((f) => f.id)];
                      linkMultiple(projectId, allIds);
                      tabs.openMultiple(relatedPrompt.relatedFiles.map((f) => f.id));
                      setRelatedPrompt(null);
                    }}
                  />
                </div>
              )}

              {/* ── Preview tab content (always-mounted, hidden when inactive) ── */}
              {tabs.previewTabOpen && (
                <div
                  className={`flex-1 min-h-0 flex flex-col ${tabs.activeFileId === PREVIEW_TAB_ID ? '' : 'sr-only'}`}
                  style={tabs.activeFileId !== PREVIEW_TAB_ID ? { position: 'absolute', width: 0, height: 0, overflow: 'hidden' } : undefined}
                >
                  {showPreview && previewThemeId ? (
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <PreviewPanel
                        ref={previewRef}
                        storeDomain={connection!.store_domain}
                        themeId={previewThemeId}
                        projectId={projectId}
                        path={previewPathOverride ?? previewPathFromFile(activeFilePath)}
                        syncStatus={connection!.sync_status}
                        isSourceThemePreview={isPreviewUsingSourceTheme}
                        fill
                        themeFiles={rawFiles.map((f) => ({ id: f.id, path: f.path }))}
                        onFilesRefresh={() => queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })}
                        onElementSelected={(el) => {
                          setSelectedElement(el);
                          agentChatRef.current?.querySelector('textarea')?.focus();
                        }}
                        liveChangeCount={livePreviewState.changeCount}
                        onAnnotation={(data) => {
                          setPendingAnnotation(data);
                          // Pre-fill the chat input with the annotation note
                          const textarea = agentChatRef.current?.querySelector('textarea');
                          if (textarea && data.note) {
                            textarea.value = data.note;
                            textarea.focus();
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                          } else if (textarea) {
                            textarea.focus();
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                      <div className="w-14 h-14 mb-3 rounded-xl ide-surface-inset border ide-border flex items-center justify-center">
                        <svg className="w-7 h-7 ide-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                        </svg>
                      </div>
                      <p className="text-sm ide-text-muted font-medium">
                        {connected && !previewThemeId
                          ? 'Setting up preview theme…'
                          : 'Import a theme or connect Shopify to see preview'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── File editor content ── */}
              {tabs.activeFileId && tabs.activeFileId !== PREVIEW_TAB_ID ? (
                <>
                  {/* EPIC 3: File breadcrumb */}
                  <FileBreadcrumb
                    filePath={activeFile?.path ?? null}
                    content={activeFileContent}
                  />

                  {/* Editor area with relative positioning for QuickActionsToolbar overlay */}
                  <div ref={editorContainerRef} className="relative flex-1 min-h-0 flex flex-col">
                    <FileEditor
                      ref={editorRef}
                      fileId={tabs.activeFileId}
                      fileType={
                        rawFiles.find((f) => f.id === tabs.activeFileId)?.file_type ??
                        'liquid'
                      }
                      onSave={() => devReport.refresh()}
                      onMarkDirty={handleMarkDirty}
                      cursors={cursorsForActiveFile}
                      locked={tabs.isLocked(tabs.activeFileId)}
                      onSelectionChange={handleEditorSelectionChange}
                      onSelectionPosition={handleSelectionPosition}
                      onContentChange={handleContentChange}
                      onFixWithAI={handleFixWithAI}
                    />

                    {/* A5: QuickActionsToolbar — floating toolbar on text selection */}
                    <QuickActionsToolbar
                      isVisible={quickActionsVisible}
                      position={quickActionsPosition}
                      selectedText={quickActionsText}
                      fileType={(activeFile?.file_type ?? 'liquid') as 'liquid' | 'javascript' | 'css' | 'other'}
                      onAction={handleQuickAction}
                      onDismiss={() => setQuickActionsVisible(false)}
                    />
                  </div>

                  {/* A5: ThemeConsole — collapsible bottom panel below editor */}
                  <ThemeConsole
                    isOpen={consoleOpen}
                    onToggle={() => setConsoleOpen((o) => !o)}
                    activeTab={consoleTab}
                    onTabChange={setConsoleTab}
                    entries={consoleEntries}
                    counts={{
                      diagnostics: consoleEntries.filter((e) => consoleTab === 'diagnostics' || true).length,
                      'push-log': 0,
                      'theme-check': 0,
                    }}
                    onClear={handleConsoleClear}
                  />

                  {/* EPIC 3: Status bar */}
                  <StatusBar
                    fileName={activeFile?.name ?? null}
                    content={activeFileContent}
                    language={(activeFile?.file_type ?? 'other') as 'liquid' | 'javascript' | 'css' | 'other'}
                    filePath={activeFile?.path ?? null}
                    tokenUsage={tokenUsage}
                    activeMemoryCount={memory.activeConventionCount}
                    cacheBackend={process.env.NEXT_PUBLIC_CACHE_BACKEND as 'redis' | 'memory' | undefined ?? undefined}
                  >
                    <LocalSyncIndicator projectId={projectId} />
                    <BinarySyncIndicator projectId={projectId} />
                  </StatusBar>
                </>
              ) : tabs.activeFileId !== PREVIEW_TAB_ID ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative">
                  <h2 className="text-lg font-medium ide-text-2 mb-1">
                    No file selected
                  </h2>
                  <p className="text-sm ide-text-3">
                    {hasFiles
                      ? 'Select a file from the explorer to start editing'
                      : 'Import a theme or upload files to begin'}
                  </p>
                  {/* Sync indicators when no file is open */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-3">
                    <LocalSyncIndicator projectId={projectId} />
                    <BinarySyncIndicator projectId={projectId} />
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* ── Canvas view (EPIC 15) ──────────────────────────────────── */}
          {viewMode === 'canvas' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center ide-surface">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-sky-500 dark:border-sky-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs ide-text-3">Loading canvas…</span>
                  </div>
                </div>
              }
            >
              <CanvasView
                files={canvasData.files}
                dependencies={canvasData.dependencies}
                activeFileId={tabs.activeFileId}
                modifiedFileIds={tabs.unsavedFileIds}
                onFileClick={(fileId) => {
                  tabs.openTab(fileId);
                  setViewMode('editor');
                }}
                onCanvasChat={(message, contextFileIds) => {
                  // Send message to agent with only canvas-selected file context
                  console.log('[Canvas chat]', message, contextFileIds);
                }}
              />
            </Suspense>
          )}

          {/* ── Customize view (EPIC 11) ───────────────────────────────── */}
          {viewMode === 'customize' && (
            templateLayout.isLoading ? (
              <div className="flex-1 flex items-center justify-center ide-surface">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-sky-500 dark:border-sky-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs ide-text-3">Loading customizer…</span>
                </div>
              </div>
            ) : templateLayout.error ? (
              <div className="flex-1 flex items-center justify-center ide-surface">
                <div className="flex flex-col items-center gap-3 text-center px-6">
                  <div className="w-14 h-14 rounded-xl ide-surface-inset border ide-border flex items-center justify-center">
                    <svg className="w-7 h-7 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                      <line x1="12" y1="8" x2="12" y2="12" strokeWidth={1.5} />
                      <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={1.5} />
                    </svg>
                  </div>
                  <p className="text-sm ide-text-muted font-medium">{templateLayout.error}</p>
                  <button
                    type="button"
                    onClick={() => setViewMode('editor')}
                    className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
                  >
                    Back to Editor
                  </button>
                </div>
              </div>
            ) : templateLayout.templates.length === 0 ? (
              <div className="flex-1 flex items-center justify-center ide-surface">
                <div className="flex flex-col items-center gap-3 text-center px-6">
                  <div className="w-14 h-14 rounded-xl ide-surface-inset border ide-border flex items-center justify-center">
                    <svg className="w-7 h-7 ide-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
                      <path d="M3 9h18" strokeWidth={1.5} />
                      <path d="M9 21V9" strokeWidth={1.5} />
                    </svg>
                  </div>
                  <p className="text-sm ide-text-muted font-medium">
                    No JSON templates found
                  </p>
                  <p className="text-xs ide-text-3 max-w-[280px]">
                    The customizer requires JSON templates (templates/*.json). Import a Shopify Online Store 2.0 theme to use this feature.
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('editor')}
                    className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
                  >
                    Back to Editor
                  </button>
                </div>
              </div>
            ) : (
              <CustomizerMode
                previewUrl={`/api/projects/${projectId}/preview?path=/`}
                templates={templateLayout.templates.map((t) => t.name)}
                activeTemplate={templateLayout.activeTemplate ?? ''}
                sections={enrichedSections}
                connectionId={connection?.id ?? null}
                themeId={previewThemeId ?? null}
                projectId={projectId}
                onTemplateChange={(templateName) => {
                  const match = templateLayout.templates.find((t) => t.name === templateName);
                  if (match) templateLayout.setActiveTemplate(match.path);
                }}
                onSectionsReorder={(fromIndex, toIndex) => {
                  const layout = templateLayout.layout;
                  if (!layout) return;
                  const order = layout.sections.map((s) => s.id);
                  const [moved] = order.splice(fromIndex, 1);
                  order.splice(toIndex, 0, moved);
                  templateLayout.reorderSections(order);
                }}
                onAddSection={() => {
                  // Default: add a generic section (future: show section picker modal)
                  templateLayout.addSection('custom-content');
                }}
                onRemoveSection={(sectionId) => templateLayout.removeSection(sectionId)}
                onSettingsChange={(sectionId, settings) =>
                  templateLayout.updateSectionSettings(sectionId, settings)
                }
                onExit={() => setViewMode('editor')}
              />
            )
          )}
        </main>

        {/* ── Col 4: Right — Full-height Agent Chat ─────────────────────── */}
        <aside
          className="relative border-l ide-border-subtle flex-shrink-0 flex flex-col min-h-0 ide-surface"
          style={{ width: rightResize.width }}
        >
          <ResizeHandle
            side="left"
            minWidth={rightResize.minWidth}
            maxWidth={rightResize.maxWidth}
            currentWidth={rightResize.width}
            onResize={rightResize.setWidth}
            onDoubleClick={rightResize.resetWidth}
          />

          {/* A5: IntentCompletionPanel — workflow step tracker (when a workflow is active) */}
          {activeWorkflow && (
            <IntentCompletionPanel
              match={activeWorkflow}
              progress={
                activeWorkflow
                  ? {
                      total: activeWorkflow.steps.length,
                      completed: activeWorkflow.steps.filter((s) => s.completed).length,
                      pending: activeWorkflow.steps.filter((s) => !s.completed).length,
                      percentage: activeWorkflow.steps.length > 0
                        ? Math.round(
                            (activeWorkflow.steps.filter((s) => s.completed).length /
                              activeWorkflow.steps.length) *
                              100
                          )
                        : 0,
                    }
                  : null
              }
              onToggleStep={handleWorkflowToggleStep}
              onApplyStep={handleWorkflowApplyStep}
              onApplyAll={handleWorkflowApplyAll}
              onPreviewAll={handleWorkflowPreviewAll}
              onDismiss={handleWorkflowDismiss}
            />
          )}

          {/* Agent Chat — fills full right sidebar */}
          <div ref={agentChatRef} className="flex-1 flex flex-col min-h-0 p-2">
            {/* Agent chat header with Memory button */}
            <div className="flex items-center justify-end mb-1 shrink-0">
              <button
                type="button"
                onClick={() => setMemoryOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium ide-text-3 hover:text-accent ide-hover rounded transition-colors"
                title="Open Developer Memory"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12 2a9 9 0 0 1 9 9c0 3.9-3.2 7.2-6.4 9.8a2.1 2.1 0 0 1-2.6 0h0A23.3 23.3 0 0 1 3 11a9 9 0 0 1 9-9Z" />
                  <path d="M12 2a7 7 0 0 0-4.9 2" />
                  <path d="M12 2a7 7 0 0 1 4.9 2" />
                  <circle cx="12" cy="11" r="3" />
                </svg>
                Memory
              </button>
            </div>
            <AgentPromptPanel
              projectId={projectId}
              context={sidebar.context}
              selectedElement={selectedElement}
              onDismissElement={() => setSelectedElement(null)}
              hasShopifyConnection={connected}
              fileCount={rawFiles.length}
              getPreviewSnapshot={getPreviewSnapshot}
              onApplyCode={handleApplyCode}
              onSaveCode={handleSaveCode}
              getActiveFileContent={getActiveFileContent}
              onTokenUsage={handleTokenUsage}
              getPassiveContext={passiveContext.getContextString}
              onOpenFile={handleOpenFile}
              resolveFileId={handleResolveFileId}
              resolveFileContent={handleResolveFileContent}
              sendMessageRef={sendMessageRef}
              onApplyStatsRef={onApplyStatsRef}
              onOpenPlanFile={handleOpenPlanFile}
              onNavigatePreview={handleNavigatePreview}
              onConfirmFileCreate={handleConfirmFileCreate}
              captureBeforeSnapshot={captureBeforeSnapshot}
              verifyPreview={verifyPreview}
              pendingAnnotation={pendingAnnotation}
              onClearAnnotation={() => setPendingAnnotation(null)}
              onLiveChange={handleLiveChange}
              onLiveSessionStart={livePreviewActions.startSession}
              onLiveSessionEnd={handleLiveSessionEnd}
            />
          </div>
        </aside>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <FileUploadModal
        projectId={projectId}
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <ImportThemeModal
        projectId={projectId}
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
      />

      <HomeModal
        isOpen={showHomeModal}
        onClose={() => setShowHomeModal(false)}
        currentProjectId={projectId}
        onSelectProject={(id) => {
          setShowHomeModal(false);
          router.push(`/projects/${id}`);
        }}
        onImportSuccess={(id) => {
          setShowHomeModal(false);
          if (id) router.push(`/projects/${id}`);
        }}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* EPIC 3 + A6: Command palette (Ctrl+P) — file search + command mode */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        files={commandPaletteFiles}
        recentFiles={tabs.recentFiles}
        onFileSelect={(fileId) => {
          tabs.openTab(fileId);
          setCommandPaletteOpen(false);
        }}
        commands={paletteCommands}
      />

      {/* A7: Agent workflow modals */}
      {planApproval && (
        <PlanApprovalModal
          steps={planApproval.steps}
          isOpen={true}
          onApprove={() => setPlanApproval(null)}
          onModify={() => setPlanApproval(null)}
          onCancel={() => setPlanApproval(null)}
        />
      )}

      {batchDiff && (
        <BatchDiffModal
          isOpen={true}
          title={batchDiff.title}
          entries={batchDiff.entries}
          onApplyAll={() => setBatchDiff(null)}
          onClose={() => setBatchDiff(null)}
        />
      )}

      {themeReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 dark:bg-black/50 backdrop-blur-sm" onClick={() => setThemeReview(null)}>
          <div className="relative w-full max-w-2xl max-h-[80vh] rounded-xl border ide-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <ThemeReviewReportPanel
              report={themeReview}
              onClose={() => setThemeReview(null)}
            />
          </div>
        </div>
      )}

      {/* Auto-reconcile UndoToast */}
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          duration={10000}
          onUndo={handleUndoArchive}
          onDismiss={() => setUndoToast(null)}
        />
      )}

      {memoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 dark:bg-black/50 backdrop-blur-sm" onClick={() => setMemoryOpen(false)}>
          <div className="relative w-full max-w-xl max-h-[80vh] rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <MemoryPanel
              memories={memory.memories}
              isLoading={memory.isLoading}
              onFeedback={memory.setFeedback}
              onForget={memory.forget}
              onEdit={memory.edit}
              activeConventionCount={memory.activeConventionCount}
            />
            <button
              type="button"
              onClick={() => setMemoryOpen(false)}
              className="absolute top-2 right-2 z-10 rounded p-1 ide-text-3 ide-hover hover:ide-text-2 transition-colors"
              aria-label="Close memory panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {devReportOpen && devReport.data && (
        <DevReportModal
          report={devReport.data}
          prePush={devReportPrePush}
          onClose={() => {
            setDevReportOpen(false);
            setDevReportPrePush(false);
          }}
          onConfirmPush={async () => {
            await handlePush();
          }}
        />
      )}
    </div>
    </EditorSettingsProvider>
    </ChromaticSettingsProvider>
  );
}
