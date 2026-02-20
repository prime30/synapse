'use client';

import { useCallback } from 'react';
import { History, X } from 'lucide-react';
import type { RecentEdit } from '@/hooks/useFileTabs';

interface RecentlyEditedBarProps {
  recentEdits: RecentEdit[];
  fileMetaMap: Map<string, { id: string; name: string }>;
  activeFileId: string | null;
  openTabs: string[];
  onOpenFile: (fileId: string) => void;
}

function shortName(name: string): string {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function RecentlyEditedBar({
  recentEdits,
  fileMetaMap,
  activeFileId,
  openTabs,
  onOpenFile,
}: RecentlyEditedBarProps) {
  const resolved = recentEdits
    .map((r) => ({ ...r, meta: fileMetaMap.get(r.fileId) }))
    .filter((r) => r.meta != null);

  const handleClick = useCallback(
    (fileId: string) => {
      onOpenFile(fileId);
    },
    [onOpenFile],
  );

  if (resolved.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-b ide-border-subtle overflow-x-auto scrollbar-none">
      <History className="h-3 w-3 ide-text-muted shrink-0" aria-hidden />
      <span className="text-[10px] font-medium ide-text-muted shrink-0 uppercase tracking-wider">
        Recent
      </span>

      {resolved.map(({ fileId, editedAt, meta }) => {
        const isActive = fileId === activeFileId;
        const isOpen = openTabs.includes(fileId);

        return (
          <button
            key={fileId}
            type="button"
            onClick={() => handleClick(fileId)}
            title={`${meta!.name} — edited ${relativeTime(editedAt)}`}
            className={`
              shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono
              transition-colors
              ${isActive
                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                : isOpen
                  ? 'ide-surface-input ide-text-2 border ide-border-subtle'
                  : 'ide-text-muted hover:ide-text-2 ide-hover'
              }
            `}
          >
            <span className="truncate max-w-[120px]">{shortName(meta!.name)}</span>
            <span className="ide-text-3 text-[9px]">{relativeTime(editedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
