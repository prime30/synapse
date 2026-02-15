'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { FileTab } from './FileTab';
import { PREVIEW_TAB_ID } from '@/hooks/useFileTabs';
import type { FileGroup } from '@/lib/shopify/theme-grouping';

export interface FileMeta {
  id: string;
  name: string;
}

interface FileTabsProps {
  openTabs: string[];
  activeFileId: string | null;
  unsavedFileIds: Set<string>;
  lockedFileIds?: Set<string>;
  fileMetaMap: Map<string, FileMeta>;
  onTabSelect: (fileId: string) => void;
  onTabClose: (fileId: string) => void;
  onAddFile: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  tabGroups?: FileGroup[];
  activeGroupId?: string | null;
  onGroupSelect?: (groupId: string) => void;
  onGroupClose?: (groupId: string) => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  /** Whether the preview tab is currently open */
  previewTabOpen?: boolean;
  /** Callback to close the preview tab */
  onClosePreviewTab?: () => void;
  /** Whether the active file has unsaved changes */
  isActiveFileDirty?: boolean;
  /** Whether the active file is locked */
  isActiveFileLocked?: boolean;
  /** Called when user clicks Save */
  onSaveClick?: () => void;
  /** Called when user toggles the lock */
  onLockToggle?: () => void;
}

export function FileTabs({
  openTabs,
  activeFileId,
  unsavedFileIds,
  fileMetaMap,
  onTabSelect,
  onTabClose,
  onAddFile,
  onNextTab,
  onPrevTab,
  tabGroups,
  activeGroupId,
  onGroupSelect,
  onGroupClose,
  lockedFileIds,
  onReorderTabs,
  previewTabOpen,
  onClosePreviewTab,
  isActiveFileDirty = false,
  isActiveFileLocked = false,
  onSaveClick,
  onLockToggle,
}: FileTabsProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex && onReorderTabs) {
      onReorderTabs(dragIndex, targetIndex);
    }
    setDragIndex(null);
  }, [dragIndex, onReorderTabs]);
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        if (activeFileId) onTabClose(activeFileId);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) onPrevTab();
        else onNextTab();
      }
    },
    [activeFileId, onTabClose, onNextTab, onPrevTab]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const hasGroups = Boolean(tabGroups && tabGroups.length > 0);

  const visibleTabs = useMemo(() => {
    // Always filter the preview sentinel from the regular file tab list
    const fileTabs = openTabs.filter((id) => id !== PREVIEW_TAB_ID);
    if (!hasGroups || activeGroupId == null) {
      return fileTabs;
    }
    const activeGroup = tabGroups!.find((g) => g.id === activeGroupId);
    if (!activeGroup) {
      return fileTabs;
    }
    const groupFileSet = new Set(activeGroup.fileIds);
    return fileTabs.filter((fileId) => groupFileSet.has(fileId));
  }, [openTabs, hasGroups, activeGroupId, tabGroups]);

  return (
    <div className="flex flex-col">
      {hasGroups && (
        <div className="ide-surface-panel border-b ide-border px-2 py-1 flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => onGroupSelect?.('__all__')}
            className={`px-2.5 py-1 text-xs rounded-full cursor-pointer transition-colors ${
              activeGroupId == null
                ? 'ide-surface-inset ide-text'
                : 'ide-surface-panel ide-text-muted hover:ide-text ide-hover'
            }`}
          >
            All
          </button>
          {tabGroups!.map((group) => (
            <span
              key={group.id}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full cursor-pointer transition-colors ${
                activeGroupId === group.id
                  ? 'ide-surface-inset ide-text'
                  : 'ide-surface-panel ide-text-muted hover:ide-text ide-hover'
              }`}
              role="button"
              tabIndex={0}
              onClick={() => onGroupSelect?.(group.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onGroupSelect?.(group.id);
                }
              }}
            >
              {group.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onGroupClose?.(group.id);
                }}
                className="ml-0.5 hover:ide-text transition-colors"
                aria-label={`Close group ${group.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-stretch ide-surface-panel border-b ide-border overflow-x-auto">
        <div className="flex flex-1 min-w-0">
          {/* Pinned preview tab (always first) */}
          {previewTabOpen && (
            <FileTab
              fileId={PREVIEW_TAB_ID}
              fileName="Preview"
              isActive={activeFileId === PREVIEW_TAB_ID}
              isUnsaved={false}
              isLocked={false}
              icon={<Globe className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />}
              pinned
              onSelect={() => onTabSelect(PREVIEW_TAB_ID)}
              onClose={() => onClosePreviewTab?.()}
              index={-1}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
            />
          )}
          {visibleTabs.map((fileId, idx) => {
            const meta = fileMetaMap.get(fileId);
            const fileName = meta?.name ?? fileId;
            return (
              <FileTab
                key={fileId}
                fileId={fileId}
                fileName={fileName}
                isActive={activeFileId === fileId}
                isUnsaved={unsavedFileIds.has(fileId)}
                isLocked={lockedFileIds?.has(fileId) ?? false}
                onSelect={() => onTabSelect(fileId)}
                onClose={() => onTabClose(fileId)}
                index={idx}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save + Lock controls (only for real files, not preview) */}
        {activeFileId && activeFileId !== PREVIEW_TAB_ID && (
          <div className="flex items-center gap-1 pr-2 shrink-0">
            <button
              type="button"
              onClick={onSaveClick}
              disabled={!isActiveFileDirty || isActiveFileLocked}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                isActiveFileDirty && !isActiveFileLocked
                  ? 'text-sky-500 dark:text-sky-400 hover:ide-text ide-hover'
                  : 'ide-text-muted opacity-50 cursor-default'
              }`}
              title={isActiveFileLocked ? 'File is locked' : isActiveFileDirty ? 'Save (Ctrl+S)' : 'No unsaved changes'}
            >
              Save
            </button>
            <button
              type="button"
              onClick={onLockToggle}
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                isActiveFileLocked
                  ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                  : 'ide-text-muted hover:ide-text-2 ide-hover'
              }`}
              title={isActiveFileLocked ? 'File is locked — click to unlock' : 'Lock file to prevent edits'}
            >
              {isActiveFileLocked ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
