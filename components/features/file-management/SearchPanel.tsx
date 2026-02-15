'use client';

import { useState, useEffect, useRef } from 'react';
import { FileListItem } from './FileListItem';
import {
  useProjectFiles,
  type ProjectFile,
} from '@/hooks/useProjectFiles';
import type { FileType } from '@/lib/types/files';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

type SortOption = 'name' | 'type' | 'size' | 'date';

const FILTER_OPTIONS: { value: FileType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'css', label: 'CSS' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date Modified' },
];

interface SearchPanelProps {
  projectId: string | null;
  onFileClick: (fileId: string) => void;
  presence?: WorkspacePresence[];
  snippetUsageCounts?: Map<string, number>;
}

export function SearchPanel({
  projectId,
  onFileClick,
  presence = [],
  snippetUsageCounts,
}: SearchPanelProps) {
  const [localSearch, setLocalSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    files,
    rawFiles,
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

  // Auto-focus search input when the panel mounts
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Debounce local search -> hook search
  useEffect(() => {
    const t = setTimeout(() => setSearch(localSearch), 300);
    return () => clearTimeout(t);
  }, [localSearch, setSearch]);

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

  const totalCount = rawFiles.length;
  const matchCount = files.length;
  const hasQuery = search.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <span className="text-xs font-semibold uppercase tracking-wider ide-text-muted">
          Search
        </span>
        {hasQuery && (
          <span className="text-[11px] ide-text-3">
            {matchCount} of {totalCount}
          </span>
        )}
      </div>

      {/* ── Search input ──────────────────────────────────────────── */}
      <div className="p-2 space-y-2 border-b ide-border">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 ide-text-muted">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search files by name..."
            className="w-full pl-8 pr-2 py-1.5 text-sm ide-input rounded"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => setLocalSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 ide-text-muted hover:ide-text text-xs"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* ── Filter pills ──────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === opt.value
                  ? 'bg-sky-500 text-white'
                  : 'ide-surface-panel ide-text-muted ide-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Sort dropdown ─────────────────────────────────────── */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="w-full px-2 py-1 text-sm ide-input rounded"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 ide-surface-inset rounded animate-pulse"
              />
            ))}
          </div>
        ) : !hasQuery ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="w-10 h-10 mb-3 rounded-lg ide-surface-input border ide-border-subtle flex items-center justify-center">
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ide-text-3"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p className="text-sm ide-text-muted font-medium">Search files</p>
            <p className="text-xs ide-text-3 mt-1">
              Type to search {totalCount} files by name
            </p>
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center ide-text-muted text-sm">
            No files match &apos;{search}&apos;
          </div>
        ) : (
          <div className="py-1">
            {files.map((file: ProjectFile) => (
              <FileListItem
                key={file.id}
                file={file}
                onClick={() => onFileClick(file.id)}
                presence={presence}
                snippetUsageCount={snippetUsageCounts?.get(file.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
