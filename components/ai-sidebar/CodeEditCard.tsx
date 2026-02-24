'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, FileCode, ExternalLink } from 'lucide-react';
import { InlineDiffViewer } from '@/components/features/suggestions/InlineDiffViewer';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { clampConfidence, getConfidenceLabel } from '@/lib/agents/confidence-flow';

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

interface CodeEditProps {
  filePath: string;
  reasoning?: string;
  newContent: string;
  originalContent?: string;
  status: 'pending' | 'applied' | 'rejected';
  confidence?: number;
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenFile?: (filePath: string) => void;
  onStatusChange?: (status: 'applied' | 'rejected') => void;
}

export function CodeEditCard({
  filePath,
  reasoning,
  newContent,
  originalContent,
  status,
  confidence,
  onApplyCode,
  resolveFileId,
  onOpenFile,
  onStatusChange,
}: CodeEditProps) {
  const [localStatus, setLocalStatus] = useState(status);
  const [expanded, setExpanded] = useState(status === 'pending');
  const [showReasoning, setShowReasoning] = useState(false);
  const [viewMode, setViewMode] = useState<'diff' | 'preview'>('diff');
  const [sideBySide, setSideBySide] = useState(false);

  const effectiveStatus = localStatus !== status ? localStatus : status;
  const hasOriginal = originalContent != null && originalContent.length > 0;

  const diffStats = useMemo(() => {
    if (!hasOriginal) return null;
    return computeDiffStats(originalContent!, newContent);
  }, [hasOriginal, originalContent, newContent]);

  const handleApply = () => {
    const fileId = resolveFileId?.(filePath) ?? filePath;
    onApplyCode?.(newContent, fileId, filePath);
    setLocalStatus('applied');
    onStatusChange?.('applied');
  };

  const handleReject = () => {
    setLocalStatus('rejected');
    onStatusChange?.('rejected');
  };

  const fileName = filePath.split('/').pop() ?? filePath;

  const containerCls = 'overflow-hidden ' + (
    effectiveStatus === 'applied' ? 'bg-emerald-500/[0.03]' :
    effectiveStatus === 'rejected' ? 'opacity-60' : ''
  );

  const chevronCls = 'h-3 w-3 ide-text-3 transition-transform ' + (expanded ? '' : '-rotate-90');

  const diffBtnCls = 'rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ' + (
    viewMode === 'diff'
      ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20'
      : 'ide-text-muted ide-border-subtle hover:ide-text-2'
  );

  const previewBtnCls = 'rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ' + (
    viewMode === 'preview'
      ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20'
      : 'ide-text-muted ide-border-subtle hover:ide-text-2'
  );

  const sbsBtnCls = 'rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ' + (
    sideBySide
      ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20'
      : 'ide-text-muted ide-border-subtle hover:ide-text-2'
  );

  const diffHeight = Math.min(300, Math.max(120, newContent.split('\n').length * 18));

  return (
    <div className={containerCls} role="region" aria-label={'Code edit: ' + filePath}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0">
          <ChevronDown className={chevronCls} />
        </button>
        <FileCode className="h-3.5 w-3.5 ide-text-3 shrink-0" />
        <button
          type="button"
          onClick={() => onOpenFile?.(filePath)}
          className="font-mono text-[11px] ide-text-2 truncate hover:text-sky-500 dark:hover:text-sky-400 transition-colors text-left min-w-0"
          title={filePath}
        >
          {filePath}
        </button>
        {diffStats && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">+{diffStats.added}</span>
            <span className="text-red-500 dark:text-red-400">-{diffStats.removed}</span>
          </span>
        )}
        {clampConfidence(confidence) != null && (
          <ConfidenceBadge confidence={confidence} className="shrink-0" />
        )}
        {effectiveStatus === 'applied' && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 ml-auto">Applied</span>
        )}
        {effectiveStatus === 'rejected' && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 ml-auto">Rejected</span>
        )}
        {onOpenFile && (
          <button
            type="button"
            onClick={() => onOpenFile(filePath)}
            className="shrink-0 ide-text-muted hover:ide-text-2 transition-colors ml-auto"
            title="Open file"
            aria-label={'Open ' + fileName}
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-2">
          {reasoning && (
            <div className="mb-1.5">
              <button
                type="button"
                onClick={() => setShowReasoning((r) => !r)}
                className="text-[10px] ide-text-muted hover:ide-text-2 transition-colors"
              >
                {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
              </button>
              {showReasoning && (
                <p className="mt-0.5 text-[11px] ide-text-3 leading-relaxed">{reasoning}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 mb-1.5">
            {hasOriginal && (
              <>
                <button type="button" onClick={() => setViewMode('diff')} className={diffBtnCls}>
                  Diff
                </button>
                <button type="button" onClick={() => setViewMode('preview')} className={previewBtnCls}>
                  Preview
                </button>
                {viewMode === 'diff' && (
                  <button type="button" onClick={() => setSideBySide((s) => !s)} className={sbsBtnCls}>
                    Side by side
                  </button>
                )}
              </>
            )}
          </div>

          {hasOriginal && viewMode === 'diff' ? (
            <InlineDiffViewer
              originalContent={originalContent!}
              proposedContent={newContent}
              fileName={filePath}
              sideBySide={sideBySide}
              height={diffHeight}
            />
          ) : (
            <pre className="max-h-[240px] overflow-auto rounded ide-surface-input p-2 text-[11px] font-mono ide-text-2 border ide-border-subtle">
              <code>{newContent}</code>
            </pre>
          )}

          {clampConfidence(confidence) != null && getConfidenceLabel(clampConfidence(confidence)!) && (
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Review recommended
            </p>
          )}

          {effectiveStatus === 'pending' && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReject}
                className="rounded px-2.5 py-1 text-xs ide-text-muted hover:text-red-500 dark:hover:text-red-400 ide-hover transition-colors focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:outline-none"
              >
                Accept
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
