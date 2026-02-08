'use client';

import type { FileVersion } from '@/lib/types/version';
import { formatRelativeTime } from '@/hooks/useProjectFiles';

interface VersionListItemProps {
  version: FileVersion;
  isCurrent: boolean;
  onRestore: (versionId: string) => void;
  isRestoring?: boolean;
}

export function VersionListItem({
  version,
  isCurrent,
  onRestore,
  isRestoring = false,
}: VersionListItemProps) {
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 rounded transition-colors ${
        isCurrent
          ? 'bg-blue-500/10 border border-blue-500/30'
          : 'hover:bg-gray-700/50 border border-transparent'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
            isCurrent
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-gray-700 text-gray-400'
          }`}
        >
          v{version.version_number}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200 font-medium">
            Version {version.version_number}
          </span>
          {isCurrent && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              Current
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {formatRelativeTime(version.created_at)}
        </div>
        {version.change_summary && (
          <div className="text-xs text-gray-400 mt-1">
            {version.change_summary}
          </div>
        )}
      </div>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onRestore(version.id)}
          disabled={isRestoring}
          className="flex-shrink-0 px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRestoring ? 'Restoring…' : 'Restore'}
        </button>
      )}
    </div>
  );
}
