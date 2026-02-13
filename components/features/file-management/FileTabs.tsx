'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileTab } from './FileTab';
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
    if (!hasGroups || activeGroupId == null) {
      return openTabs;
    }
    const activeGroup = tabGroups!.find((g) => g.id === activeGroupId);
    if (!activeGroup) {
      return openTabs;
    }
    const groupFileSet = new Set(activeGroup.fileIds);
    return openTabs.filter((fileId) => groupFileSet.has(fileId));
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
        <button
          type="button"
          onClick={onAddFile}
          className="px-3 py-2 ide-text-muted hover:ide-text ide-hover border-l ide-border transition-colors"
          aria-label="Add file"
        >
          +
        </button>
      </div>
    </div>
  );
}
