'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileTabs } from '@/components/features/file-management/FileTabs';
import { FileList } from '@/components/features/file-management/FileList';
import { FileViewer } from '@/components/features/file-management/FileViewer';
import { FileEditor } from '@/components/features/file-management/FileEditor';
import { FileUploadModal } from '@/components/features/file-management/FileUploadModal';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { ActiveUsersPanel } from '@/components/collaboration/ActiveUsersPanel';
import { useFileTabs } from '@/hooks/useFileTabs';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useWorkspaceWsToken } from '@/hooks/useWorkspaceWsToken';
import { useRemoteCursors } from '@/hooks/useRemoteCursors';

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.projectId as string;

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tabs = useFileTabs({ projectId });
  const { rawFiles } = useProjectFiles(projectId);
  const { connected, connection, themes } = useShopifyConnection(projectId);
  const presence = useWorkspacePresence(projectId);
  const { token: wsToken } = useWorkspaceWsToken(projectId);
  const allCursors = useRemoteCursors({
    workspaceId: projectId,
    token: wsToken ?? undefined,
  });
  const activeFilePath = useMemo(
    () =>
      tabs.activeFileId
        ? rawFiles.find((f) => f.id === tabs.activeFileId)?.path
        : undefined,
    [tabs.activeFileId, rawFiles]
  );
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

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-200">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-800">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-lg font-medium">Project {projectId}</h1>
        {toast && (
          <span className="text-sm text-green-400 animate-pulse">{toast}</span>
        )}
      </header>

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
      />

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 border-r border-gray-800 flex-shrink-0 flex flex-col min-h-0">
          <ActiveUsersPanel presence={presence} />
          <FileList
            projectId={projectId}
            onFileClick={handleFileClick}
            onAddFile={handleAddFile}
            presence={presence}
          />
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          {editMode ? (
            <FileEditor
              fileId={tabs.activeFileId}
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
          )}
        </main>
        {showPreview && mainTheme && (
          <aside className="w-[420px] border-l border-gray-800 flex-shrink-0 flex flex-col min-h-0 p-3 overflow-auto">
            <PreviewPanel
              storeDomain={connection!.store_domain}
              themeId={mainTheme.id}
              projectId={projectId}
              path={activeFilePath}
            />
          </aside>
        )}
      </div>

      <FileUploadModal
        projectId={projectId}
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
