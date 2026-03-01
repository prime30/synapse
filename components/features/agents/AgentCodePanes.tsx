'use client';

import { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/hooks/useTheme';
import { getAgentColor } from '@/lib/agents/agent-colors';
import type { FileCategory, PaneEntry } from '@/hooks/useAgentCodePanes';

// ── Config ────────────────────────────────────────────────────────────

const CATEGORY_ORDER: FileCategory[] = ['liquid', 'css', 'js', 'json'];

const CATEGORY_META: Record<FileCategory, { label: string; lang: string; agentKey: string }> = {
  liquid: { label: 'Liquid', lang: 'liquid', agentKey: 'liquid' },
  css: { label: 'CSS', lang: 'css', agentKey: 'css' },
  js: { label: 'JavaScript', lang: 'javascript', agentKey: 'javascript' },
  json: { label: 'JSON', lang: 'json', agentKey: 'json' },
};

// ── Props ─────────────────────────────────────────────────────────────

export interface AgentCodePanesProps {
  panes: Map<FileCategory, PaneEntry>;
  visible: boolean;
  onApply: (category: FileCategory) => void;
  onRefine: (category: FileCategory) => void;
  onDismiss: () => void;
}

// ── Individual pane ───────────────────────────────────────────────────

function CodePane({
  entry,
  onApply,
  onRefine,
}: {
  entry: PaneEntry;
  onApply: () => void;
  onRefine: () => void;
}) {
  const { isDark } = useTheme();
  const codeRef = useRef<HTMLDivElement>(null);
  const meta = CATEGORY_META[entry.fileCategory];
  const colors = getAgentColor(meta.agentKey);
  const fileName = entry.filePath.split('/').pop() ?? entry.filePath;

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [entry.content]);

  return (
    <div className="flex flex-col min-w-0 border-r last:border-r-0 ide-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b ide-border-subtle flex-shrink-0">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border} border`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {meta.label}
        </span>
        <span className="text-[11px] ide-text-muted truncate" title={entry.filePath}>
          {fileName}
        </span>
      </div>

      {/* Code area */}
      <div
        ref={codeRef}
        className="flex-1 min-h-0 overflow-auto ide-surface-inset"
      >
        <SyntaxHighlighter
          language={meta.lang}
          style={isDark ? vscDarkPlus : oneLight}
          showLineNumbers
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
            fontSize: '10px',
          }}
          customStyle={{
            margin: 0,
            padding: '8px 0',
            background: 'transparent',
            fontSize: '11px',
            lineHeight: '1.5',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono, ui-monospace, monospace)' } }}
        >
          {entry.content || '// Waiting for agent output\u2026'}
        </SyntaxHighlighter>
      </div>

      {/* Footer buttons */}
      <div className="flex items-center gap-2 px-3 py-2 border-t ide-border-subtle flex-shrink-0">
        <button
          type="button"
          onClick={onApply}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onRefine}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium ide-surface-input border ide-border ide-text-2 hover:ide-text rounded-md transition-colors"
        >
          Refine
        </button>
      </div>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────

export function AgentCodePanes({
  panes,
  visible,
  onApply,
  onRefine,
  onDismiss,
}: AgentCodePanesProps) {
  const activePanes = useMemo(() => {
    const sorted: PaneEntry[] = [];
    for (const cat of CATEGORY_ORDER) {
      const entry = panes.get(cat);
      if (entry) sorted.push(entry);
    }
    return sorted;
  }, [panes]);

  const gridCols =
    activePanes.length === 1
      ? 'grid-cols-1'
      : activePanes.length === 2
        ? 'grid-cols-2'
        : activePanes.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-4';

  return (
    <AnimatePresence>
      {visible && activePanes.length > 0 && (
        <motion.div
          key="agent-code-panes"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="flex-shrink-0 border-t ide-border overflow-hidden"
          style={{ maxHeight: 500 }}
        >
          {/* Dismiss bar */}
          <div className="flex items-center justify-between px-3 py-1.5 ide-surface-panel border-b ide-border-subtle">
            <span className="text-[10px] font-medium ide-text-muted uppercase tracking-wider">
              Agent Code Output
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="p-0.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
              aria-label="Dismiss code panes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Panes grid */}
          <div className={`grid ${gridCols} ide-surface-panel`} style={{ height: 460 }}>
            {activePanes.map((entry) => (
              <CodePane
                key={entry.fileCategory}
                entry={entry}
                onApply={() => onApply(entry.fileCategory)}
                onRefine={() => onRefine(entry.fileCategory)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
