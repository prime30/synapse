'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, FileCode, Camera } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { InlineDiffViewer } from '@/components/features/suggestions/InlineDiffViewer';
import { ScreenshotCompareCard } from './ScreenshotCompareCard';

interface ChangeEntry {
  fileId: string;
  fileName: string;
  originalContent: string;
  proposedContent: string;
  reasoning: string;
  changeType?: 'create' | 'edit' | 'delete';
}

function computeDiffStats(original: string, proposed: string): { added: number; removed: number } {
  const oldLines = original.split('\n');
  const newLines = proposed.split('\n');
  let added = 0;
  let removed = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) { added++; continue; }
    if (i >= newLines.length) { removed++; continue; }
    if (oldLines[i] !== newLines[i]) { added++; removed++; }
  }
  return { added, removed };
}

export interface ChangePreviewCardProps {
  executionId: string;
  sessionId?: string | null;
  projectId: string;
  changes: ChangeEntry[];
  onApproved?: (appliedCount: number) => void;
  onRejected?: () => void;
}

export function ChangePreviewCard({
  executionId,
  sessionId,
  projectId,
  changes,
  onApproved,
  onRejected,
}: ChangePreviewCardProps) {
  const [status, setStatus] = useState<'pending' | 'approving' | 'approved' | 'rejected'>('pending');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    if (changes.length === 1) return new Set([changes[0].fileName]);
    return new Set<string>();
  });
  const [error, setError] = useState<string | null>(null);
  const [beforeScreenshotUrl, setBeforeScreenshotUrl] = useState<string | null>(null);
  const [afterScreenshotUrl, setAfterScreenshotUrl] = useState<string | null>(null);

  const totalStats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      const s = computeDiffStats(c.originalContent, c.proposedContent);
      added += s.added;
      removed += s.removed;
    }
    return { added, removed };
  }, [changes]);

  const toggleFile = useCallback((fileName: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  }, []);

  const handleApprove = useCallback(async () => {
    setStatus('approving');
    setError(null);
    try {
      const res = await fetch(`/api/agents/executions/${executionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Approval failed (${res.status})`);
      }
      const data = await res.json();
      const result = data?.data;
      setStatus('approved');

      if (result?.beforeScreenshotUrl) setBeforeScreenshotUrl(result.beforeScreenshotUrl);
      if (result?.afterScreenshotUrl) setAfterScreenshotUrl(result.afterScreenshotUrl);

      onApproved?.(result?.appliedCount ?? changes.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
      setStatus('pending');
    }
  }, [executionId, projectId, changes.length, onApproved]);

  const handleReject = useCallback(async () => {
    setStatus('rejected');
    try {
      await fetch(`/api/agents/executions/${executionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
    } catch { /* best-effort cleanup */ }
    onRejected?.();
  }, [executionId, projectId, onRejected]);

  const containerCls = 'rounded-md border ide-border-subtle overflow-hidden ' + (
    status === 'approved' ? 'bg-emerald-500/[0.03]' :
    status === 'rejected' ? 'opacity-60' : ''
  );

  const hasScreenshots = !!(beforeScreenshotUrl && afterScreenshotUrl);

  return (
    <div className={containerCls} role="region" aria-label="Change preview">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold ide-text-2">
            {changes.length} file{changes.length !== 1 ? 's' : ''} changed
          </span>
          {sessionId ? (
            <span
              className="rounded border ide-border-subtle px-1.5 py-0.5 text-[10px] font-mono ide-text-muted"
              title={sessionId}
            >
              session {sessionId.slice(0, 8)}
            </span>
          ) : null}
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">+{totalStats.added}</span>
            <span className="text-red-500 dark:text-red-400">-{totalStats.removed}</span>
          </span>
        </div>
        {status === 'approved' && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            Applied
          </span>
        )}
        {status === 'rejected' && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20">
            Rejected
          </span>
        )}
      </div>

      {/* File list */}
      <div className="divide-y ide-border-subtle">
        {changes.map((change) => {
          const isExpanded = expandedFiles.has(change.fileName);
          const stats = computeDiffStats(change.originalContent, change.proposedContent);
          const diffHeight = Math.min(300, Math.max(120, change.proposedContent.split('\n').length * 18));

          return (
            <div key={change.fileName}>
              <button
                type="button"
                onClick={() => toggleFile(change.fileName)}
                className="w-full flex items-center gap-2 px-3 py-1.5 ide-hover transition-colors text-left"
              >
                <ChevronDown className={`h-3 w-3 ide-text-3 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
                <FileCode className="h-3.5 w-3.5 ide-text-3 shrink-0" />
                <span className="font-mono text-[11px] ide-text-2 truncate min-w-0">
                  {change.fileName}
                </span>
                {(() => {
                  const type = change.changeType ?? (!change.originalContent ? 'create' : 'edit');
                  if (type === 'create') return <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-[#28CD56]/10 text-[#28CD56]">New</span>;
                  if (type === 'delete') return <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-red-500/10 text-red-500 dark:text-red-400">Deleted</span>;
                  return null;
                })()}
                <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono ml-auto">
                  <span className="text-emerald-600 dark:text-emerald-400">+{stats.added}</span>
                  <span className="text-red-500 dark:text-red-400">-{stats.removed}</span>
                </span>
              </button>

              {isExpanded && (
                <div className="px-3 pb-2">
                  {change.reasoning && (
                    <p className="mb-1.5 text-[11px] ide-text-3 leading-relaxed line-clamp-2">
                      {change.reasoning}
                    </p>
                  )}
                  <InlineDiffViewer
                    originalContent={change.originalContent}
                    proposedContent={change.proposedContent}
                    fileName={change.fileName}
                    height={diffHeight}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visual before/after comparison (shown after approval if screenshots available) */}
      {status === 'approved' && hasScreenshots && (
        <div className="px-3 py-2 border-t ide-border-subtle">
          <div className="flex items-center gap-1.5 mb-2">
            <Camera className="h-3.5 w-3.5 ide-text-3" />
            <span className="text-[11px] font-medium ide-text-2">Visual comparison</span>
          </div>
          <ScreenshotCompareCard
            beforeUrl={beforeScreenshotUrl!}
            afterUrl={afterScreenshotUrl!}
            diffPercentage={0}
            threshold={0}
            passed={true}
          />
        </div>
      )}

      {/* Screenshot loading indicator during approval */}
      {status === 'approving' && (
        <div className="px-3 py-2 border-t ide-border-subtle flex items-center gap-2 text-[11px] ide-text-muted">
          <LambdaDots size={12} />
          Applying changes and capturing screenshots...
        </div>
      )}

      {/* Footer: Approve / Reject */}
      {(status === 'pending' || status === 'approving') && (
        <div className="flex items-center justify-between px-3 py-2 border-t ide-border-subtle">
          {error && (
            <span className="text-[11px] text-red-500 dark:text-red-400 truncate mr-2">{error}</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleReject}
              disabled={status === 'approving'}
              className="rounded px-2.5 py-1 text-xs ide-text-muted hover:text-red-500 dark:hover:text-red-400 ide-hover transition-colors focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={status === 'approving'}
              className="rounded px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:outline-none disabled:opacity-50 flex items-center gap-1.5"
            >
              {status === 'approving' && <LambdaDots size={12} />}
              Approve All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
