'use client';

import { useMemo } from 'react';

export interface TokenUsageDisplay {
  inputTokens: number;
  outputTokens: number;
}

interface StatusBarProps {
  fileName: string | null;
  content: string;
  language: 'liquid' | 'javascript' | 'css' | 'other';
  filePath?: string | null;
  /** EPIC 2: Token usage from last AI response */
  tokenUsage?: TokenUsageDisplay | null;
  /** EPIC 7: Whether the app is online */
  isOnline?: boolean;
  /** EPIC 7: Whether there are queued offline changes */
  hasOfflineChanges?: boolean;
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
  return <span className="w-px h-3 bg-gray-700 shrink-0" />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function StatusBar({ fileName, content, language, filePath, tokenUsage, isOnline = true, hasOfflineChanges = false }: StatusBarProps) {
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const sizeLabel = useMemo(() => formatSize(new Blob([content]).size), [content]);
  const langLabel = LANGUAGE_LABELS[language];

  return (
    <div className="h-[22px] flex items-center gap-2 px-3 bg-gray-900/80 border-t border-gray-800 text-[11px] text-gray-500 select-none shrink-0">
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

      {/* EPIC 2: Token count display */}
      {tokenUsage && (
        <>
          <span className="whitespace-nowrap text-gray-600" title={`Input: ${tokenUsage.inputTokens} tokens, Output: ${tokenUsage.outputTokens} tokens`}>
            ↑{formatTokenCount(tokenUsage.inputTokens)} ↓{formatTokenCount(tokenUsage.outputTokens)}
          </span>
          <Divider />
        </>
      )}

      {/* Cursor position placeholder */}
      <span className="whitespace-nowrap">Ln 1, Col 1</span>
    </div>
  );
}
