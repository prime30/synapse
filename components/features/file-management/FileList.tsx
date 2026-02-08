'use client';

import { FileListControls } from './FileListControls';
import { FileListItem } from './FileListItem';
import {
  useProjectFiles,
  type ProjectFile,
} from '@/hooks/useProjectFiles';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

interface FileListProps {
  projectId: string | null;
  onFileClick: (fileId: string) => void;
  onAddFile?: () => void;
  presence?: WorkspacePresence[];
}

export function FileList({
  projectId,
  onFileClick,
  onAddFile,
  presence = [],
}: FileListProps) {
  const {
    files,
    isLoading,
    error,
    refetch,
    search,
    setSearch,
    sort,
    setSort,
    filter,
    setFilter,
  } = useProjectFiles(projectId);

  if (!projectId) {
    return (
      <div className="p-4 text-gray-500 text-sm">Select a project</div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load files</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-blue-400 text-sm hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300">
          Files ({files.length})
        </span>
        {onAddFile && (
          <button
            type="button"
            onClick={onAddFile}
            className="text-xs text-blue-400 hover:underline"
          >
            + Add
          </button>
        )}
      </div>
      <FileListControls
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        filter={filter}
        onFilterChange={setFilter}
      />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 bg-gray-700/30 rounded animate-pulse"
              />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {search ? (
              <>No files match &apos;{search}&apos;</>
            ) : (
              <>
                <p className="mb-2">No files yet</p>
                <p className="text-xs mb-3">
                  Upload your Shopify theme files to get started.
                </p>
                {onAddFile && (
                  <button
                    type="button"
                    onClick={onAddFile}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500"
                  >
                    Upload Your First File
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="py-1">
            {files.map((file: ProjectFile) => (
              <FileListItem
                key={file.id}
                file={file}
                onClick={() => onFileClick(file.id)}
                presence={presence}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
