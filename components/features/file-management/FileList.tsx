'use client';

import { useState, useMemo, useCallback } from 'react';
import { FileListItem } from './FileListItem';
import {
  useProjectFiles,
  type ProjectFile,
} from '@/hooks/useProjectFiles';
import { THEME_DIRECTORIES } from '@/lib/shopify/theme-structure';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';
import type { FileType } from '@/lib/types/files';
import { ExplorerContextSections } from './ExplorerContextSections';
import { LambdaDots } from '@/components/ui/LambdaDots';

interface FileListProps {
  projectId: string | null;
  onFileClick: (fileId: string) => void;
  onAddFile?: () => void;
  presence?: WorkspacePresence[];
  snippetUsageCounts?: Map<string, number>;
  agentEditedPaths?: Set<string>;
  activeFileId?: string | null;
  activeFileContent?: string | null;
  activeFilePath?: string | null;
  activeFileType?: string | null;
}

interface DirectoryGroup {
  directory: string;
  label: string;
  files: ProjectFile[];
}

const FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'liquid' as const, label: 'Liquid' },
  { value: 'javascript' as const, label: 'JavaScript' },
  { value: 'css' as const, label: 'CSS' },
] satisfies { value: FileType | 'all'; label: string }[];

/** Extract the top-level directory from a file path, e.g. "sections/header.liquid" -> "sections" */
function getTopDir(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
  const slashIdx = normalized.indexOf('/');
  return slashIdx > 0 ? normalized.slice(0, slashIdx).toLowerCase() : '';
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CHEVRON_ICON_PROPS = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const FOLDER_ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function DirectoryNode({
  group,
  isOpen,
  onToggle,
  onFileClick,
  presence,
  snippetUsageCounts,
  agentEditedPaths,
}: {
  group: DirectoryGroup;
  isOpen: boolean;
  onToggle: () => void;
  onFileClick: (fileId: string) => void;
  presence: WorkspacePresence[];
  snippetUsageCounts?: Map<string, number>;
  agentEditedPaths?: Set<string>;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left ide-hover rounded transition-colors group"
      >
        {/* Chevron */}
        <span className="flex-shrink-0 ide-text-muted transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <svg {...CHEVRON_ICON_PROPS}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        {/* Folder icon */}
        <span className="flex-shrink-0 ide-text-muted">
          {isOpen ? (
            <svg {...FOLDER_ICON_PROPS}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          ) : (
            <svg {...FOLDER_ICON_PROPS}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </span>
        {/* Directory name + count */}
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium ide-text">
          {group.label}
        </span>
        <span className="flex-shrink-0 text-[11px] ide-text-3 tabular-nums">
          {group.files.length}
        </span>
      </button>
      {isOpen && (
        <div className="ml-3">
          {group.files.map((file) => (
            <FileListItem
              key={file.id}
              file={file}
              onClick={() => onFileClick(file.id)}
              presence={presence}
              snippetUsageCount={snippetUsageCounts?.get(file.id)}
              hasAgentEdits={agentEditedPaths?.has(file.path) ?? false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileList({
  projectId,
  onFileClick,
  onAddFile,
  presence = [],
  snippetUsageCounts,
  agentEditedPaths,
  activeFileId = null,
  activeFileContent = null,
  activeFilePath = null,
  activeFileType = null,
}: FileListProps) {
  const {
    files,
    isLoading,
    error,
    refetch,
    filter,
    setFilter,
  } = useProjectFiles(projectId);

  // Track which directories are expanded (all open by default)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleDir = useCallback((dir: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  // Group files by Shopify canonical directory
  const groups = useMemo((): DirectoryGroup[] => {
    if (!files.length) return [];

    const buckets = new Map<string, ProjectFile[]>();

    for (const file of files) {
      const dir = getTopDir(file.path);
      const key = dir || '_other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(file);
    }

    // Sort files within each bucket alphabetically by name
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
    }

    const result: DirectoryGroup[] = [];

    // Add canonical Shopify directories in order
    for (const dir of THEME_DIRECTORIES) {
      const dirFiles = buckets.get(dir);
      if (dirFiles && dirFiles.length > 0) {
        result.push({
          directory: dir,
          label: capitalize(dir),
          files: dirFiles,
        });
        buckets.delete(dir);
      }
    }

    // Add any remaining non-canonical directories
    for (const [key, dirFiles] of buckets.entries()) {
      if (dirFiles.length > 0) {
        result.push({
          directory: key,
          label: key === '_other' ? 'Other' : capitalize(key),
          files: dirFiles,
        });
      }
    }

    return result;
  }, [files]);

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(groups.map((g) => g.directory)));
  }, [groups]);

  const totalCount = files.length;

  if (!projectId) {
    return (
      <div className="p-4 ide-text-muted text-sm">Select a project</div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load files</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sky-500 dark:text-sky-400 text-sm hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b ide-border gap-2">
        <span className="text-sm font-medium ide-text-2 flex-shrink-0">
          Files ({totalCount})
        </span>
        <div className="flex items-center gap-0.5 ml-auto">
          {onAddFile && (
            <button
              type="button"
              onClick={onAddFile}
              title="New file"
              className="w-7 h-7 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            >
              <svg {...ICON_PROPS}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </button>
          )}
          <button
            type="button"
            disabled
            title="New folder"
            className="w-7 h-7 flex items-center justify-center rounded-md ide-text-muted opacity-50 cursor-not-allowed"
          >
            <svg {...ICON_PROPS}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            title="Refresh"
            className="w-7 h-7 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          >
            <svg {...ICON_PROPS}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse all"
            className="w-7 h-7 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          >
            <svg {...ICON_PROPS}>
              <polyline points="18 15 12 9 6 15" />
              <polyline points="18 20 12 14 6 20" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b ide-border">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              filter === opt.value
                ? 'bg-sky-500 text-white'
                : 'ide-surface-panel ide-text-muted ide-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <p className="text-xs ide-text-muted mb-2 flex items-center gap-2">
              <LambdaDots size={14} />
              Loading theme files...
            </p>
            {[75, 60, 90, 70, 85, 65].map((w, i) => (
              <div
                key={i}
                className="h-7 ide-surface-inset rounded animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="p-4 text-center ide-text-muted text-sm">
            <p className="mb-2">No files yet</p>
            <p className="text-xs mb-3">
              Upload your Shopify theme files to get started.
            </p>
            {onAddFile && (
              <button
                type="button"
                onClick={onAddFile}
                className="px-3 py-1.5 bg-sky-500 dark:bg-sky-400 text-white text-sm rounded hover:bg-sky-600 dark:hover:bg-sky-300"
              >
                Upload Your First File
              </button>
            )}
          </div>
        ) : (
          <div className="py-1 px-1">
            {groups.map((group) => (
              <DirectoryNode
                key={group.directory}
                group={group}
                isOpen={!collapsed.has(group.directory)}
                onToggle={() => toggleDir(group.directory)}
                onFileClick={onFileClick}
                presence={presence}
                snippetUsageCounts={snippetUsageCounts}
                agentEditedPaths={agentEditedPaths}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Context sections footer ──────────────────────────────── */}
      {projectId && (
        <ExplorerContextSections
          projectId={projectId}
          activeFileId={activeFileId}
          activeFileContent={activeFileContent}
          activeFilePath={activeFilePath}
          activeFileType={activeFileType}
        />
      )}
    </div>
  );
}
