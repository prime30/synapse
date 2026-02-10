'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoginTransition } from '@/components/features/auth/LoginTransition';
import { FileTabs } from '@/components/features/file-management/FileTabs';
import { FileList } from '@/components/features/file-management/FileList';
import { FileViewer } from '@/components/features/file-management/FileViewer';
import { FileEditor } from '@/components/features/file-management/FileEditor';
import { FileUploadModal } from '@/components/features/file-management/FileUploadModal';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { ActiveUsersPanel } from '@/components/collaboration/ActiveUsersPanel';
import { ProjectTabs } from '@/components/features/projects/ProjectTabs';
import { DesignTokenBrowser } from '@/components/features/design-system/DesignTokenBrowser';
import { SuggestionPanel } from '@/components/features/suggestions/SuggestionPanel';
import { VersionHistoryPanel } from '@/components/features/versions/VersionHistoryPanel';
import { ShopifyConnectPanel } from '@/components/features/shopify/ShopifyConnectPanel';
import { AgentPromptPanel } from '@/components/features/agents/AgentPromptPanel';
import { UserMenu } from '@/components/features/auth/UserMenu';
import { useFileTabs } from '@/hooks/useFileTabs';
import { useAISidebar } from '@/hooks/useAISidebar';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import { useProjects } from '@/hooks/useProjects';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useRemoteCursors } from '@/hooks/useRemoteCursors';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';

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
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  type RightPanelTab = 'preview' | 'suggestions' | 'versions' | 'shopify' | 'design' | 'agent';
  const [rightPanel, setRightPanel] = useState<RightPanelTab>('preview');

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
  const versionHistory = useVersionHistory(tabs.activeFileId ?? null);
  useEffect(() => {
    sidebar.updateContext({
      filePath: activeFile?.path ?? null,
      fileLanguage: activeFile?.file_type ?? null,
      selection: null,
    });
  }, [activeFile?.path, activeFile?.file_type, sidebar.updateContext]);

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
      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H2',location:'app/projects/[projectId]/page.tsx:99',message:'recovery effect skipped (loading or already attempted)',data:{projectId,isLoadingProjects,recoveryAttempted:recoveryAttemptedRef.current,projectsCount:projects.length,isCurrentProjectAccessible},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return;
    }
    if (isCurrentProjectAccessible) {
      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H2',location:'app/projects/[projectId]/page.tsx:105',message:'current project is accessible; no recovery redirect',data:{projectId,projectsCount:projects.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return;
    }

    recoveryAttemptedRef.current = true;
    // #region agent log H2
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H2',location:'app/projects/[projectId]/page.tsx:112',message:'current project inaccessible; attempting recovery',data:{projectId,projectsCount:projects.length,nextProjectId:projects[0]?.id??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (projects.length > 0) {
      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H2',location:'app/projects/[projectId]/page.tsx:117',message:'recovery redirecting to first accessible project',data:{fromProjectId:projectId,toProjectId:projects[0].id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      router.replace(`/projects/${projects[0].id}`);
      return;
    }

    // No projects found — but don't auto-create; we may have just
    // been redirected here from project creation. Just let the IDE load.
    // #region agent log H2
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H2',location:'app/projects/[projectId]/page.tsx:125',message:'recovery found no projects; staying put',data:{projectId,projectsCount:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

  // Cmd/Ctrl+Shift+A: switch to Agent panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        setRightPanel('agent');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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

  const handleAddFile = () => setUploadModalOpen(true);
  const handleUploadSuccess = () => {
    refreshFiles();
    setToast('File added');
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileClick = (fileId: string) => {
    tabs.openTab(fileId);
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

  // ── Group tab handlers ────────────────────────────────────────────────────
  const handleGroupSelect = (groupId: string) => {
    if (groupId === '__all__') {
      tabs.switchGroup('');
    } else {
      tabs.switchGroup(groupId);
    }
  };

  return (
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

      {/* ── Main 3-pane layout ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: File explorer ──────────────────────────────────────────── */}
        <aside className="w-64 border-r border-gray-800 flex-shrink-0 flex flex-col min-h-0">
          <ActiveUsersPanel presence={presence} />
          {/* Import / Upload actions */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 shrink-0">
            <button
              type="button"
              onClick={handleOpenImport}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import Theme
            </button>
            <button
              type="button"
              onClick={handleAddFile}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors ml-auto"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5 1v8M1 5h8" />
              </svg>
              Add File
            </button>
          </div>
          {hasFiles ? (
            <FileList
              projectId={projectId}
              onFileClick={handleFileClick}
              onAddFile={handleAddFile}
              presence={presence}
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
        </aside>

        {/* ── Center: File tabs + Editor ─────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col">
          <FileTabs
            openTabs={tabs.openTabs}
            activeFileId={tabs.activeFileId}
            unsavedFileIds={tabs.unsavedFileIds}
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
          />
          {tabs.activeFileId ? (
            editMode ? (
              <FileEditor
                fileId={tabs.activeFileId}
                fileType={
                  rawFiles.find((f) => f.id === tabs.activeFileId)?.file_type ??
                  'liquid'
                }
                onSave={() => setEditMode(false)}
                onMarkDirty={handleMarkDirty}
                cursors={cursorsForActiveFile}
              />
            ) : (
              <FileViewer
                fileId={tabs.activeFileId}
                onEdit={() => setEditMode(true)}
                onCopy={() => {
                  setToast('Copied!');
                  setTimeout(() => setToast(null), 2000);
                }}
              />
            )
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
        </main>

        {/* ── Right: Preview / Suggestions / Versions / Shopify / Design / Agent ── */}
        <aside className={`${showPreview && previewThemeId ? 'w-[420px]' : 'w-[360px]'} border-l border-gray-800 flex-shrink-0 flex flex-col min-h-0`}>
          <div className="flex border-b border-gray-800 flex-shrink-0 flex-wrap gap-px">
            {(
              [
                ['preview', 'Preview'],
                ['suggestions', 'Suggestions'],
                ['versions', 'Versions'],
                ['shopify', 'Shopify'],
                ['design', 'Design'],
                ['agent', 'Agent'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRightPanel(key)}
                className={`px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  rightPanel === key
                    ? 'text-gray-200 border-b-2 border-blue-500 bg-gray-800/30'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {rightPanel === 'preview' && (
              showPreview && previewThemeId ? (
                <div className="flex-1 overflow-auto p-3">
                  <PreviewPanel
                    storeDomain={connection!.store_domain}
                    themeId={previewThemeId}
                    projectId={projectId}
                    path={previewPathFromFile(activeFilePath)}
                    syncStatus={connection!.sync_status}
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
              )
            )}
            {rightPanel === 'suggestions' && (
              <div className="flex-1 overflow-auto p-2">
                <SuggestionPanel projectId={projectId} fileId={tabs.activeFileId ?? undefined} />
              </div>
            )}
            {rightPanel === 'versions' && (
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
            {rightPanel === 'shopify' && (
              <div className="flex-1 overflow-auto p-2">
                <ShopifyConnectPanel projectId={projectId} />
              </div>
            )}
            {rightPanel === 'design' && (
              <DesignTokenBrowser projectId={projectId} />
            )}
            {rightPanel === 'agent' && (
              <div className="flex-1 flex flex-col min-h-0 p-2">
                <AgentPromptPanel projectId={projectId} context={sidebar.context} />
              </div>
            )}
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
    </div>
  );
}
