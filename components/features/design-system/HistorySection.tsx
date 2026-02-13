'use client';

import { useState, useCallback } from 'react';
import { useDesignVersions, type DesignVersion } from '@/hooks/useDesignVersions';

interface HistorySectionProps {
  projectId: string;
}

/* ── Version row ──────────────────────────────────────────────────── */

function VersionRow({
  version,
  isLatest,
  onRollback,
  isRollingBack,
}: {
  version: DesignVersion;
  isLatest: boolean;
  onRollback: (id: string) => void;
  isRollingBack: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const changes = version.changes;
  const changeCount = changes?.tokenChanges?.length ?? 0;
  const fileCount = changes?.filesModified?.length ?? 0;
  const date = new Date(version.created_at);

  return (
    <div className="border-b ide-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 ide-hover transition-colors text-left focus:outline-none focus:ring-2 focus:ring-accent"
        aria-label={`Toggle version ${version.version_number} details`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`w-3.5 h-3.5 ide-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium ide-text tabular-nums">v{version.version_number}</span>
          {isLatest && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent/15 text-accent border border-accent/25">
              Latest
            </span>
          )}
        </div>

        <span className="text-xs ide-text-muted flex-shrink-0 tabular-nums">
          {changeCount} change{changeCount !== 1 ? 's' : ''} &middot; {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>

        <span className="text-xs ide-text-muted flex-shrink-0">
          {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })},{' '}
          {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {version.description && (
            <p className="text-sm ide-text-2">{version.description}</p>
          )}

          {/* Token changes detail */}
          {changes?.tokenChanges && changes.tokenChanges.length > 0 && (
            <div className="border ide-border rounded-lg divide-y ide-border-subtle overflow-hidden">
              {changes.tokenChanges.slice(0, 15).map((ch, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase">
                    {ch.type}
                  </span>
                  <code className="text-xs font-mono ide-text truncate">{ch.oldValue ?? ch.tokenName}</code>
                  <span className="ide-text-muted text-xs">&rarr;</span>
                  <code className="text-xs font-mono text-accent truncate">{ch.newValue ?? '(deleted)'}</code>
                </div>
              ))}
              {changes.tokenChanges.length > 15 && (
                <div className="px-3 py-2 text-xs ide-text-muted text-center">
                  + {changes.tokenChanges.length - 15} more
                </div>
              )}
            </div>
          )}

          {/* Files modified */}
          {changes?.filesModified && changes.filesModified.length > 0 && (
            <div>
              <p className="text-xs ide-text-muted mb-1.5">Modified files:</p>
              <div className="flex flex-wrap gap-1.5">
                {changes.filesModified.map((f) => (
                  <span key={f} className="px-2 py-0.5 text-[10px] font-mono rounded ide-surface-input ide-text-2 border ide-border-subtle">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rollback */}
          {!isLatest ? null : confirmRollback ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="text-xs text-red-400 flex-1">
                This will revert all changes from v{version.version_number}. This action creates a new version.
              </p>
              <button
                type="button"
                onClick={() => { onRollback(version.id); setConfirmRollback(false); }}
                disabled={isRollingBack}
                className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {isRollingBack ? 'Rolling back…' : 'Confirm Rollback'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRollback(false)}
                className="px-3 py-1.5 text-xs ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRollback(true)}
              className="px-3 py-1.5 text-xs font-medium ide-text-2 border ide-border rounded-lg hover:ide-text hover:border-red-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Rollback this version
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

function HistorySkeleton() {
  return (
    <div className="space-y-0 border ide-border rounded-lg overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse border-b ide-border-subtle last:border-b-0">
          <div className="h-3 w-8 rounded ide-surface-input" />
          <div className="h-3 w-32 rounded ide-surface-input flex-1" />
          <div className="h-3 w-20 rounded ide-surface-input" />
        </div>
      ))}
    </div>
  );
}

/* ── Main HistorySection ──────────────────────────────────────────── */

export function HistorySection({ projectId }: HistorySectionProps) {
  const { versions, isLoading, error, rollback, isRollingBack, rollbackError } =
    useDesignVersions(projectId);

  const handleRollback = useCallback(
    async (versionId: string) => {
      try {
        await rollback(versionId);
      } catch {
        // Error is surfaced via rollbackError
      }
    },
    [rollback],
  );

  if (isLoading) return <HistorySkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-red-400 mb-2">
          {error instanceof Error ? error.message : 'Failed to load history'}
        </p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 ide-text-muted">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold ide-text mb-1">No version history yet</h3>
        <p className="text-sm ide-text-2 max-w-xs">
          Versions are created when you apply token changes from the Cleanup tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm ide-text-2">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {rollbackError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {rollbackError instanceof Error ? rollbackError.message : 'Rollback failed'}
        </div>
      )}

      <div className="border ide-border rounded-lg overflow-hidden">
        {versions.map((v, i) => (
          <VersionRow
            key={v.id}
            version={v}
            isLatest={i === 0}
            onRollback={handleRollback}
            isRollingBack={isRollingBack}
          />
        ))}
      </div>
    </div>
  );
}
