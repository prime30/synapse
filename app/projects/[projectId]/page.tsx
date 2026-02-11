'use client';

import { useParams, useRouter } from 'next/navigation';
import React, { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoginTransition } from '@/components/features/auth/LoginTransition';
import { FileTabs } from '@/components/features/file-management/FileTabs';
import { FileList } from '@/components/features/file-management/FileList';

import { FileEditor } from '@/components/features/file-management/FileEditor';
import { FileUploadModal } from '@/components/features/file-management/FileUploadModal';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import type { PreviewPanelHandle } from '@/components/preview/PreviewPanel';
import { ActiveUsersPanel } from '@/components/collaboration/ActiveUsersPanel';
import { ProjectTabs } from '@/components/features/projects/ProjectTabs';
import { DesignTokenBrowser } from '@/components/features/design-system/DesignTokenBrowser';
import { SuggestionPanel } from '@/components/features/suggestions/SuggestionPanel';
import { VersionHistoryPanel } from '@/components/features/versions/VersionHistoryPanel';
import { DiagnosticsPanel } from '@/components/diagnostics/DiagnosticsPanel';
import { ShopifyConnectPanel } from '@/components/features/shopify/ShopifyConnectPanel';
import { AgentPromptPanel } from '@/components/features/agents/AgentPromptPanel';
import { UserMenu } from '@/components/features/auth/UserMenu';
import { useFileTabs } from '@/hooks/useFileTabs';
import { useAISidebar } from '@/hooks/useAISidebar';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { useWorkspaceDiagnostics } from '@/hooks/useWorkspaceDiagnostics';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import { useProjects } from '@/hooks/useProjects';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useRemoteCursors } from '@/hooks/useRemoteCursors';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { RelatedFilesPrompt, type RelatedFileInfo } from '@/components/features/file-management/RelatedFilesPrompt';
import { getLinkedFileIds, linkMultiple, isDismissed, dismissGroup } from '@/lib/file-linking';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ActivityBar } from '@/components/editor/ActivityBar';
import { SettingsModal } from '@/components/editor/SettingsModal';
import { FileBreadcrumb } from '@/components/editor/FileBreadcrumb';
import { StatusBar } from '@/components/editor/StatusBar';
import { CommandPalette } from '@/components/editor/CommandPalette';
import { EditorSettingsProvider } from '@/hooks/useEditorSettings';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { TokenUsage } from '@/components/features/agents/AgentPromptPanel';
import { useCanvasData } from '@/hooks/useCanvasData';

// EPIC 15: Lazy-load canvas (zero bundle cost for non-canvas users)
const CanvasView = React.lazy(() =>
  import('@/components/canvas/CanvasView').then((mod) => ({ default: mod.CanvasView }))
);

type ViewMode = 'editor' | 'canvas';

/** MVP: map theme file path to storefront preview path; fallback to / for unsupported paths. */
function previewPathFromFile(filePath: string | null | undefined): string {
  if (!filePath) return '/';
  if (filePath === 'templates/index.liquid') return '/';
  // Follow-up: full template-to-route mapping (e.g. product, collection, page)
  return '/';
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.projectId as string;

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeActivity, setActiveActivity] = useState<import('@/components/editor/ActivityBar').ActivityPanel>('files');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activeFileContent, setActiveFileContent] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  // EPIC 15: View mode toggle (Editor / Canvas)
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  const tabs = useFileTabs({ projectId });
  const { rawFiles } = useProjectFiles(projectId);
  const {
    projects,
    isLoading: isLoadingProjects,
    setLastProjectId,
    createProject,
  } = useProjects();
  const { connected, connection } = useShopifyConnection(projectId);

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
  useEffect(() => {
    sidebar.updateContext({
      filePath: activeFile?.path ?? null,
      fileLanguage: activeFile?.file_type ?? null,
    });
  }, [activeFile?.path, activeFile?.file_type, sidebar.updateContext]);

  // EPIC 1c: Selection injection — track editor selection for AI context
  const handleEditorSelectionChange = useCallback((selectedText: string | null) => {
    sidebar.updateContext({ selection: selectedText });
  }, [sidebar]);

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

  // EPIC 1a: Ref for PreviewPanel to get DOM context for agent pipeline
  const previewRef = useRef<PreviewPanelHandle>(null);
  const getPreviewSnapshot = useCallback(async () => {
    if (!previewRef.current) return '';
    return previewRef.current.getDOMContext(3000);
  }, []);

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

  const showPreview = connected && connection && !!connection.theme_id;
  const previewThemeId = connection?.theme_id ?? null;

  const hasFiles = rawFiles.length > 0;

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
  const handleSwitchProject = (newProjectId: string) => {
    router.push(`/projects/${newProjectId}`);
  };

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

  // EPIC 2: Provide active file content for [RETRY_WITH_FULL_CONTEXT]
  const activeFileContentRef = useRef('');
  activeFileContentRef.current = activeFileContent;
  const getActiveFileContent = useCallback(() => {
    return activeFileContentRef.current || null;
  }, []);

  // EPIC 2: Token usage handler
  const handleTokenUsage = useCallback((usage: TokenUsage) => {
    setTokenUsage(usage);
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
    <EditorSettingsProvider>
    <div className="flex h-screen flex-col bg-gray-950 text-gray-200">
      {/* Login transition overlay (activates when ?signed_in=1 is present) */}
      <Suspense fallback={null}>
        <LoginTransition />
      </Suspense>

      {/* ── Connection status banner (authenticated IDE) ─────────────────── */}
      {!connected && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-slate-800/40 border-b border-slate-700/60 text-slate-300 text-xs">
          <span className="font-medium">No store connected</span>
          <span className="text-slate-500">&mdash;</span>
          <span>Import a theme or connect Shopify to enable live preview sync.</span>
          <button
            type="button"
            onClick={handleOpenImport}
            className="ml-2 underline hover:text-slate-100 transition-colors"
          >
            Import or connect
          </button>
        </div>
      )}

      {/* ── Header (project tabs + status) ────────────────────────────────── */}
      <header className="flex items-center border-b border-gray-800 bg-gray-900/80">
        {/* Project tabs */}
        <ProjectTabs
          currentProjectId={projectId}
          onSwitchProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
        />

        {/* Right: save / status / user menu */}
        <div className="flex items-center gap-3 px-3 shrink-0">
          {toast && (
            <span className="text-sm text-green-400 animate-pulse">
              {toast}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {connected ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                {connection?.store_domain}
              </span>
            ) : (
              'Up to date'
            )}
          </span>
          <UserMenu />
        </div>
      </header>

      {/* ── Main 4-column layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Col 1: Activity Bar (icon rail) ────────────────────────────── */}
        <ActivityBar
          activePanel={activeActivity}
          onPanelChange={setActiveActivity}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        {/* ── Col 2: Left Panel (dynamic by activeActivity) ──────────────── */}
        {activeActivity !== null && (
          <aside
            className="relative border-r border-gray-800 flex-shrink-0 flex flex-col min-h-0"
            style={{ width: leftResize.width }}
          >
            {/* Panel header */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 shrink-0">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide select-none">
                {activeActivity === 'files' && 'Explorer'}
                {activeActivity === 'suggestions' && 'Suggestions'}
                {activeActivity === 'versions' && 'Version History'}
                {activeActivity === 'shopify' && 'Shopify'}
                {activeActivity === 'design' && 'Design Tokens'}
                {activeActivity === 'diagnostics' && 'Diagnostics'}
              </span>
              {activeActivity === 'files' && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={handleOpenImport}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={handleAddFile}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M5 1v8M1 5h8" />
                    </svg>
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Panel content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeActivity === 'files' && (
                <>
                  <ActiveUsersPanel presence={presence} />
                  {hasFiles ? (
                    <FileList
                      projectId={projectId}
                      onFileClick={handleFileClick}
                      onAddFile={handleAddFile}
                      presence={presence}
                      snippetUsageCounts={snippetUsageCounts}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-end pb-8 px-4 text-center">
                      <div className="w-12 h-12 mb-3 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-6 h-6 text-gray-500"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400 font-medium">No theme loaded</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Import a theme to get started
                      </p>
                    </div>
                  )}
                </>
              )}
              {activeActivity === 'suggestions' && (
                <div className="flex-1 overflow-auto p-2">
                  <SuggestionPanel projectId={projectId} fileId={tabs.activeFileId ?? undefined} />
                </div>
              )}
              {activeActivity === 'versions' && (
                <div className="flex-1 overflow-auto p-2">
                  <VersionHistoryPanel
                    versions={versionHistory.versions}
                    currentVersion={
                      versionHistory.versions.length > 0
                        ? Math.max(
                            ...versionHistory.versions.map((v) => v.version_number)
                          )
                        : 0
                    }
                    isLoading={versionHistory.isLoading}
                    onUndo={(n) =>
                      versionHistory.undo({ current_version_number: n })
                    }
                    onRedo={(n) =>
                      versionHistory.redo({ current_version_number: n })
                    }
                    onRestore={(versionId) =>
                      versionHistory.restore({
                        version_id: versionId,
                        current_version_number:
                          versionHistory.versions.length > 0
                            ? Math.max(
                                ...versionHistory.versions.map(
                                  (v) => v.version_number
                                )
                              )
                            : 0,
                      })
                    }
                    isUndoing={versionHistory.isUndoing}
                    isRedoing={versionHistory.isRedoing}
                    isRestoring={versionHistory.isRestoring}
                  />
                </div>
              )}
              {activeActivity === 'shopify' && (
                <div className="flex-1 overflow-auto p-2">
                  <ShopifyConnectPanel projectId={projectId} />
                </div>
              )}
              {activeActivity === 'design' && (
                <DesignTokenBrowser projectId={projectId} />
              )}
              {activeActivity === 'diagnostics' && (
                <div className="flex-1 overflow-auto p-2">
                  <DiagnosticsPanel files={diagnostics.files} />
                </div>
              )}
            </div>

            <ResizeHandle
              side="right"
              minWidth={leftResize.minWidth}
              maxWidth={leftResize.maxWidth}
              onResize={leftResize.setWidth}
              onDoubleClick={leftResize.resetWidth}
            />
          </aside>
        )}

        {/* ── Col 3: Center — File tabs + Editor / Canvas ────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* EPIC 15: View mode toggle + file tabs */}
          <div className="flex items-center border-b border-gray-800 bg-gray-900/40">
            {viewMode === 'editor' && (
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
                />
              </div>
            )}
            {viewMode === 'canvas' && (
              <div className="flex-1 min-w-0" />
            )}

            {/* Editor / Canvas toggle */}
            <div className="flex items-center gap-0.5 px-2 py-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  viewMode === 'editor'
                    ? 'bg-gray-700/80 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
                title="Editor view"
              >
                <span className="flex items-center gap-1.5">
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Editor
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('canvas')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  viewMode === 'canvas'
                    ? 'bg-gray-700/80 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
                title="Canvas view — dependency graph"
              >
                <span className="flex items-center gap-1.5">
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
                    <line x1="15" y1="6" x2="9" y2="6" />
                  </svg>
                  Canvas
                </span>
              </button>
            </div>
          </div>

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

              {tabs.activeFileId ? (
                <>
                  {/* EPIC 3: File breadcrumb */}
                  <FileBreadcrumb
                    filePath={activeFile?.path ?? null}
                    content={activeFileContent}
                  />

                  <FileEditor
                    fileId={tabs.activeFileId}
                    fileType={
                      rawFiles.find((f) => f.id === tabs.activeFileId)?.file_type ??
                      'liquid'
                    }
                    onMarkDirty={handleMarkDirty}
                    cursors={cursorsForActiveFile}
                    locked={tabs.isLocked(tabs.activeFileId)}
                    onToggleLock={() => tabs.toggleLock(tabs.activeFileId!)}
                    onSelectionChange={handleEditorSelectionChange}
                    onContentChange={handleContentChange}
                  />

              {/* EPIC 3: Status bar */}
              <StatusBar
                fileName={activeFile?.name ?? null}
                content={activeFileContent}
                language={(activeFile?.file_type ?? 'other') as 'liquid' | 'javascript' | 'css' | 'other'}
                filePath={activeFile?.path ?? null}
                tokenUsage={tokenUsage}
              />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <h2 className="text-lg font-medium text-gray-400 mb-1">
                    No file selected
                  </h2>
                  <p className="text-sm text-gray-500">
                    {hasFiles
                      ? 'Select a file from the explorer to start editing'
                      : 'Import a theme or upload files to begin'}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Canvas view (EPIC 15) ──────────────────────────────────── */}
          {viewMode === 'canvas' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-gray-950">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Loading canvas…</span>
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
        </main>

        {/* ── Col 4: Right — Preview (top) + Agent Chat (bottom) ─────────── */}
        <aside
          className="relative border-l border-gray-800 flex-shrink-0 flex flex-col min-h-0"
          style={{ width: rightResize.width }}
        >
          <ResizeHandle
            side="left"
            minWidth={rightResize.minWidth}
            maxWidth={rightResize.maxWidth}
            onResize={rightResize.setWidth}
            onDoubleClick={rightResize.resetWidth}
          />

          {/* Top half: Preview */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-gray-800">
            {showPreview && previewThemeId ? (
              <div className="flex-1 overflow-auto p-3">
                <PreviewPanel
                  ref={previewRef}
                  storeDomain={connection!.store_domain}
                  themeId={previewThemeId}
                  projectId={projectId}
                  path={previewPathFromFile(activeFilePath)}
                  syncStatus={connection!.sync_status}
                  onElementSelected={(el) => {
                    setSelectedElement(el);
                    agentChatRef.current?.querySelector('textarea')?.focus();
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 mb-3 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 font-medium">
                  {connected && !previewThemeId
                    ? 'Setting up preview theme…'
                    : 'Import a theme or connect Shopify to see preview'}
                </p>
              </div>
            )}
          </div>

          {/* Bottom half: Agent Chat */}
          <div ref={agentChatRef} className="flex-1 flex flex-col min-h-0 p-2">
            <AgentPromptPanel
              projectId={projectId}
              context={sidebar.context}
              selectedElement={selectedElement}
              onDismissElement={() => setSelectedElement(null)}
              hasShopifyConnection={connected}
              fileCount={rawFiles.length}
              getPreviewSnapshot={getPreviewSnapshot}
              getActiveFileContent={getActiveFileContent}
              onTokenUsage={handleTokenUsage}
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

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* EPIC 3: Command palette (Ctrl+P) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        files={commandPaletteFiles}
        recentFiles={tabs.recentFiles}
        onFileSelect={(fileId) => {
          tabs.openTab(fileId);
          setCommandPaletteOpen(false);
        }}
      />
    </div>
    </EditorSettingsProvider>
  );
}
