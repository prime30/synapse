'use client';

import { useMemo, type ReactNode } from 'react';
import { BatchJobIndicator } from '@/components/features/batch/BatchJobIndicator';
import type { BatchJobStatus } from '@/hooks/useBatchJobs';

export interface TokenUsageDisplay {
  inputTokens: number;
  outputTokens: number;
}

interface StatusBarProps {
  fileName: string | null;
  content: string;
  language: 'liquid' | 'javascript' | 'css' | 'other';
  filePath?: string | null;
  /** Cursor line and column from Monaco editor */
  cursorPosition?: { line: number; column: number } | null;
  /** EPIC 2: Token usage from last AI response */
  tokenUsage?: TokenUsageDisplay | null;
  /** EPIC 7: Whether the app is online */
  isOnline?: boolean;
  /** EPIC 7: Whether there are queued offline changes */
  hasOfflineChanges?: boolean;
  /** EPIC 14: Count of active developer memory conventions */
  activeMemoryCount?: number;
  /** Count of learned term-to-file mappings */
  termMappingCount?: number;
  /** Cost of the last AI interaction in cents */
  lastCostCents?: number | null;
  /** Total session cost in cents */
  sessionCostCents?: number | null;
  /** Batch processing jobs to display */
  batchJobs?: BatchJobStatus[];
  /** Handler for canceling a batch job */
  onCancelBatch?: (batchId: string) => void;
  /** EPIC D: Cache backend status */
  cacheBackend?: 'redis' | 'memory' | null;
  /** Optional slot for extra indicators (e.g. binary sync progress) */
  children?: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const LANGUAGE_LABELS: Record<StatusBarProps['language'], string> = {
  liquid: 'Liquid',
  javascript: 'JavaScript',
  css: 'CSS',
  other: 'Plain Text',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Divider                                                            */
/* ------------------------------------------------------------------ */

function Divider() {
  return <span className="w-px h-3 bg-stone-200 dark:bg-white/10 shrink-0" />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function StatusBar({ fileName, content, language, filePath, cursorPosition, tokenUsage, isOnline = true, hasOfflineChanges = false, activeMemoryCount = 0, termMappingCount = 0, lastCostCents, sessionCostCents, batchJobs, onCancelBatch, cacheBackend, children }: StatusBarProps) {
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const sizeLabel = useMemo(() => formatSize(new Blob([content]).size), [content]);
  const langLabel = LANGUAGE_LABELS[language];

  return (
    <div className="h-[22px] flex items-center gap-2 px-3 bg-[#fafaf9] dark:bg-[#0a0a0a]/80 border-t ide-border-subtle text-[11px] ide-text-muted select-none shrink-0">
      {/* File name */}
      {fileName && (
        <>
          <span className="truncate max-w-[160px]" title={filePath ?? fileName}>
            {fileName}
          </span>
          <Divider />
        </>
      )}

      {/* Line count */}
      <span className="whitespace-nowrap">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
      <Divider />

      {/* Size */}
      <span className="whitespace-nowrap">{sizeLabel}</span>
      <Divider />

      {/* Language */}
      <span className="whitespace-nowrap">{langLabel}</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Batch processing indicator */}
      {batchJobs && batchJobs.length > 0 && (
        <>
          <BatchJobIndicator jobs={batchJobs} onCancel={onCancelBatch} />
          <Divider />
        </>
      )}

      {/* Extra indicators slot (e.g. binary sync progress) */}
      {children}

      {/* EPIC 7: Offline indicator */}
      {!isOnline && (
        <>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-400" title="You are offline — changes are saved locally">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            Offline {hasOfflineChanges ? '— changes saved locally' : ''}
          </span>
          <Divider />
        </>
      )}

      {/* EPIC 14: Memory indicator */}
      {(activeMemoryCount > 0 || termMappingCount > 0) && (
        <>
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-purple-400"
            title={[
              activeMemoryCount > 0 ? `${activeMemoryCount} convention${activeMemoryCount === 1 ? '' : 's'}` : '',
              termMappingCount > 0 ? `${termMappingCount} term mapping${termMappingCount === 1 ? '' : 's'}` : '',
            ].filter(Boolean).join(', ') + ' learned from this project'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 2a9 9 0 0 1 9 9c0 3.9-3.2 7.2-6.4 9.8a2.1 2.1 0 0 1-2.6 0h0A23.3 23.3 0 0 1 3 11a9 9 0 0 1 9-9Z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
            {activeMemoryCount + termMappingCount} learned
          </span>
          <Divider />
        </>
      )}

      {/* Cost indicator */}
      {(lastCostCents != null && lastCostCents > 0) && (
        <>
          <span
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-emerald-400"
            title={`Last request: $${(lastCostCents / 100).toFixed(4)}${sessionCostCents ? ` | Session total: $${((sessionCostCents ?? 0) / 100).toFixed(2)}` : ''}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            {(lastCostCents / 100).toFixed(lastCostCents < 1 ? 4 : 2)}
          </span>
          <Divider />
        </>
      )}

      {/* EPIC 2: Token count display */}
      {tokenUsage && (
        <>
          <span className="whitespace-nowrap ide-text-quiet" title={`Input: ${tokenUsage.inputTokens} tokens, Output: ${tokenUsage.outputTokens} tokens`}>
            ↑{formatTokenCount(tokenUsage.inputTokens)} ↓{formatTokenCount(tokenUsage.outputTokens)}
          </span>
          <Divider />
        </>
      )}

      {/* EPIC D: Cache backend indicator */}
      {cacheBackend && (
        <>
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap ${
              cacheBackend === 'redis' ? 'text-emerald-400' : 'text-amber-400'
            }`}
            title={
              cacheBackend === 'redis'
                ? 'Cache: Redis (distributed)'
                : 'Cache: Memory (local only)'
            }
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              cacheBackend === 'redis' ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            {cacheBackend === 'redis' ? 'Redis' : 'Mem'}
          </span>
          <Divider />
        </>
      )}

      {/* Cursor position */}
      <span className="whitespace-nowrap">Ln {cursorPosition?.line ?? 1}, Col {cursorPosition?.column ?? 1}</span>
    </div>
  );
}
