'use client';

import { useState } from 'react';
import type { FileVersion } from '@/lib/types/version';
import { VersionListItem } from './VersionListItem';
import { UndoRedoButtons } from './UndoRedoButtons';

interface VersionHistoryPanelProps {
  versions: FileVersion[];
  currentVersion: number;
  isLoading: boolean;
  onUndo: (currentVersionNumber: number) => void;
  onRedo: (currentVersionNumber: number) => void;
  onRestore: (versionId: string) => void;
  isUndoing?: boolean;
  isRedoing?: boolean;
  isRestoring?: boolean;
}

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 px-3 py-2 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-700 rounded w-24" />
        <div className="h-3 bg-gray-700 rounded w-16" />
      </div>
    </div>
  );
}

export function VersionHistoryPanel({
  versions,
  currentVersion,
  isLoading,
  onUndo,
  onRedo,
  onRestore,
  isUndoing = false,
  isRedoing = false,
  isRestoring = false,
}: VersionHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const canUndo = currentVersion > 1;
  const canRedo = versions.length > 0 && currentVersion < Math.max(...versions.map((v) => v.version_number));

  const sortedVersions = [...versions].sort(
    (a, b) => b.version_number - a.version_number
  );

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800/50 rounded-t-lg transition-colors"
      >
        <span>Version History</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          {/* Undo / Redo controls */}
          <div className="mb-3 pt-1 border-t border-gray-700">
            <div className="pt-3">
              <UndoRedoButtons
                currentVersion={currentVersion}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                isUndoing={isUndoing}
                isRedoing={isRedoing}
              />
            </div>
          </div>

          {/* Version list */}
          {isLoading ? (
            <div className="space-y-2">
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </div>
          ) : sortedVersions.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              No version history yet
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {sortedVersions.map((version) => (
                <VersionListItem
                  key={version.id}
                  version={version}
                  isCurrent={version.version_number === currentVersion}
                  onRestore={onRestore}
                  isRestoring={isRestoring}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
