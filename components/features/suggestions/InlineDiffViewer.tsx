'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { DiffEditorProps } from '@monaco-editor/react';

// Dynamically import Monaco to avoid SSR issues
const DiffEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.DiffEditor),
  { ssr: false, loading: () => <DiffEditorSkeleton /> }
);

function DiffEditorSkeleton() {
  return (
    <div className="ide-surface-inset border ide-border-subtle rounded-lg animate-pulse flex items-center justify-center" style={{ height: 300 }}>
      <span className="ide-text-muted text-xs">Loading diff viewer...</span>
    </div>
  );
}

/** Detect Monaco language from file name. */
function detectLanguage(fileName: string): string {
  if (fileName.endsWith('.liquid')) return 'html'; // closest Monaco language
  if (fileName.endsWith('.css')) return 'css';
  if (fileName.endsWith('.scss')) return 'scss';
  if (fileName.endsWith('.js')) return 'javascript';
  if (fileName.endsWith('.ts')) return 'typescript';
  if (fileName.endsWith('.json')) return 'json';
  return 'plaintext';
}

export interface InlineDiffViewerProps {
  originalContent: string;
  proposedContent: string;
  fileName: string;
  /** Show inline (unified) or side-by-side. Default: inline (false). */
  sideBySide?: boolean;
  /** Height in pixels. Default: 300. */
  height?: number;
  className?: string;
}

export function InlineDiffViewer({
  originalContent,
  proposedContent,
  fileName,
  sideBySide = false,
  height = 300,
  className = '',
}: InlineDiffViewerProps) {
  const language = useMemo(() => detectLanguage(fileName), [fileName]);

  // Detect dark mode from document
  const isDark = useMemo(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  }, []);

  const options: DiffEditorProps['options'] = useMemo(() => ({
    readOnly: true,
    renderSideBySide: sideBySide,
    enableSplitViewResizing: sideBySide,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    fontSize: 12,
    wordWrap: 'on',
    renderOverviewRuler: false,
    renderIndicators: true,
    originalEditable: false,
  }), [sideBySide]);

  return (
    <div className={`border ide-border-subtle rounded-lg overflow-hidden ${className}`}>
      <DiffEditor
        original={originalContent}
        modified={proposedContent}
        language={language}
        theme={isDark ? 'vs-dark' : 'light'}
        height={height}
        options={options}
      />
    </div>
  );
}
