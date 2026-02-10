'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileTabs } from '@/components/features/file-management/FileTabs';
import { FileList } from '@/components/features/file-management/FileList';
import { FileViewer } from '@/components/features/file-management/FileViewer';
import { FileEditor } from '@/components/features/file-management/FileEditor';
import { FileUploadModal } from '@/components/features/file-management/FileUploadModal';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { ActiveUsersPanel } from '@/components/collaboration/ActiveUsersPanel';
import { ProjectSwitcher } from '@/components/features/projects/ProjectSwitcher';
import { useFileTabs } from '@/hooks/useFileTabs';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import { useProjects } from '@/hooks/useProjects';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useRemoteCursors } from '@/hooks/useRemoteCursors';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';

export default function ProjectPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const projectId = params.projectId as string;

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tabs = useFileTabs({ projectId });
  const { rawFiles } = useProjectFiles(projectId);
  const {
    projects,
    isLoading: isLoadingProjects,
    setLastProjectId,
  } = useProjects();
  const { connected, connection, themes } = useShopifyConnection(projectId);

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
    if (isLoadingProjects || recoveryAttemptedRef.current) return;
    if (isCurrentProjectAccessible) return;

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

  const showPreview = connected && connection && themes.length > 0;
  const mainTheme = useMemo(
    () => themes.find((t) => t.role === 'main') ?? themes[0],
    [themes]
  );

  const hasFiles = rawFiles.length > 0;
  // Only block the UI while projects are actively loading for the first time.
  // Once loading finishes, show the IDE even if the project isn't in the list
  // (the list RPC may not be deployed yet, or the project was just created).
  const shouldShowRecoveryLoading = isLoadingProjects;

  // ── Toasts ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('signed_in') === '1') {
      router.replace(pathname ?? `/projects/${projectId}`);
      const t = setTimeout(() => setToast('Login successful!'), 0);
      const t2 = setTimeout(() => setToast(null), 3000);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
      };
    }
  }, [searchParams, pathname, projectId, router]);

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
      {shouldShowRecoveryLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
          <div className="flex items-center gap-3 text-gray-400">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm">Recovering project context...</span>
          </div>
        </div>
      )}

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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 bg-gray-900/80">
        {/* Left: navigation + project switcher */}
        <div className="flex items-center gap-2">
          <ProjectSwitcher
            currentProjectId={projectId}
            onSwitchProject={handleSwitchProject}
            onImportTheme={handleOpenImport}
          />
        </div>

        {/* Center: Upload Theme CTA */}
        <button
          type="button"
          onClick={handleOpenImport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          Upload Theme
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: save / status */}
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
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

      {/* ── Main 3-pane layout ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: File explorer ──────────────────────────────────────────── */}
        <aside className="w-64 border-r border-gray-800 flex-shrink-0 flex flex-col min-h-0">
          <ActiveUsersPanel presence={presence} />
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

        {/* ── Center: Editor ───────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col">
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

        {/* ── Right: Preview ───────────────────────────────────────────────── */}
        {showPreview && mainTheme ? (
          <aside className="w-[420px] border-l border-gray-800 flex-shrink-0 flex flex-col min-h-0 p-3 overflow-auto">
            <PreviewPanel
              storeDomain={connection!.store_domain}
              themeId={mainTheme.id}
              projectId={projectId}
              path={activeFilePath}
            />
          </aside>
        ) : (
          <aside className="w-[320px] border-l border-gray-800 flex-shrink-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 mb-3 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-7 h-7 text-gray-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-400 font-medium">
              Import a theme to see preview
            </p>
          </aside>
        )}
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
