'use client';

import { useSyncQueue, type ConflictEvent } from '@/hooks/useSyncQueue';

interface SyncQueueIndicatorProps {
  projectId: string | null;
}

function ConflictToast({ conflict, onDismiss }: { conflict: ConflictEvent; onDismiss: () => void }) {
  const actor = conflict.overwrittenBy === 'agent' ? 'Agent' : 'You';
  const victim = conflict.overwrittenActor === 'agent' ? "agent's" : 'your';
  const fileName = conflict.filePath.split('/').pop() ?? conflict.fileName;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span className="truncate max-w-[200px]">
        {actor} overwrote {victim} edit to <strong>{fileName}</strong>
      </span>
      <button
        onClick={onDismiss}
        className="ml-1 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function SyncQueueIndicator({ projectId }: SyncQueueIndicatorProps) {
  const { status, pendingCount, lastError, conflicts, dismissConflict } = useSyncQueue(projectId);

  if (status === 'idle' && conflicts.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Pending writes indicator */}
      {pendingCount > 0 && (
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] ${
            status === 'error'
              ? 'text-red-500 dark:text-red-400'
              : 'text-sky-500 dark:text-sky-400'
          }`}
          title={lastError ?? `${pendingCount} write(s) syncing to cloud`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              status === 'error'
                ? 'bg-red-500 dark:bg-red-400'
                : 'bg-sky-500 dark:bg-sky-400 motion-safe:animate-pulse'
            }`}
          />
          {status === 'error' ? `Sync error (${pendingCount})` : `Syncing ${pendingCount}`}
        </span>
      )}

      {/* Conflict toasts */}
      {conflicts.map((conflict, i) => (
        <ConflictToast
          key={`${conflict.fileId}-${conflict.timestamp}`}
          conflict={conflict}
          onDismiss={() => dismissConflict(i)}
        />
      ))}
    </div>
  );
}
