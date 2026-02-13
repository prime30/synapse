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
          ? 'ide-active border border-sky-500/30'
          : 'ide-hover border border-transparent'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
            isCurrent
              ? 'ide-active text-sky-500 dark:text-sky-400'
              : 'ide-surface-inset ide-text-muted'
          }`}
        >
          v{version.version_number}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm ide-text font-medium">
            Version {version.version_number}
          </span>
          {isCurrent && (
            <span className="text-xs ide-active text-sky-500 dark:text-sky-400 px-1.5 py-0.5 rounded">
              Current
            </span>
          )}
        </div>
        <div className="text-xs ide-text-muted mt-0.5">
          {formatRelativeTime(version.created_at)}
        </div>
        {version.change_summary && (
          <div className="text-xs ide-text-muted mt-1">
            {version.change_summary}
          </div>
        )}
      </div>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onRestore(version.id)}
          disabled={isRestoring}
          className="flex-shrink-0 px-2 py-1 text-xs rounded ide-surface-inset ide-text ide-hover hover:ide-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRestoring ? 'Restoring…' : 'Restore'}
        </button>
      )}
    </div>
  );
}
