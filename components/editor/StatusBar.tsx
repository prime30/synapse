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

export function StatusBar({ fileName, content, language, filePath, tokenUsage }: StatusBarProps) {
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
