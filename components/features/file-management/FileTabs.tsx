'use client';

import { useEffect, useCallback } from 'react';
import { FileTab } from './FileTab';

export interface FileMeta {
  id: string;
  name: string;
}

interface FileTabsProps {
  openTabs: string[];
  activeFileId: string | null;
  unsavedFileIds: Set<string>;
  fileMetaMap: Map<string, FileMeta>;
  onTabSelect: (fileId: string) => void;
  onTabClose: (fileId: string) => void;
  onAddFile: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
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
}: FileTabsProps) {
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

  return (
    <div className="flex items-stretch bg-gray-900 border-b border-gray-700 overflow-x-auto">
      <div className="flex flex-1 min-w-0">
        {openTabs.map((fileId) => {
          const meta = fileMetaMap.get(fileId);
          const fileName = meta?.name ?? fileId;
          return (
            <FileTab
              key={fileId}
              fileId={fileId}
              fileName={fileName}
              isActive={activeFileId === fileId}
              isUnsaved={unsavedFileIds.has(fileId)}
              onSelect={() => onTabSelect(fileId)}
              onClose={() => onTabClose(fileId)}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddFile}
        className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700/30 border-l border-gray-700/50 transition-colors"
        aria-label="Add file"
      >
        +
      </button>
    </div>
  );
}
