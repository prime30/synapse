'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  FileCode,
  Save,
  ChevronDown,
  X,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CodeBlockProps {
  /** The raw code string */
  code: string;
  /** Language for syntax highlighting (e.g., 'liquid', 'javascript', 'css') */
  language?: string;
  /** File name/path associated with this code block (from AI response parsing) */
  fileName?: string;
  /** File ID for applying changes */
  fileId?: string;
  /** Called when user confirms Apply — passes the code to write */
  onApply?: (code: string, fileId: string, fileName: string) => void;
  /** Called when user clicks Save — saves code as new file */
  onSave?: (code: string, fileName: string) => void;
  /** Previous content of the file (used for undo after apply) */
  previousContent?: string;
  /** Called to undo the apply (restore previous content) */
  onUndoApply?: (fileId: string, previousContent: string) => void;
  /** When true, code is still being streamed — use compact height + auto-scroll to bottom. */
  streaming?: boolean;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Map language aliases to react-syntax-highlighter–recognised names. */
function mapLanguage(lang?: string): string {
  if (!lang) return 'text';
  const lower = lang.toLowerCase();
  if (lower === 'liquid') return 'markup';
  return lower;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function CodeBlock({
  code,
  language,
  fileName,
  fileId,
  onApply,
  onSave,
  previousContent,
  onUndoApply,
  streaming,
}: CodeBlockProps) {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom while streaming.
  // useLayoutEffect fires BEFORE paint, preventing the top↔bottom strobe
  // that occurs when SyntaxHighlighter replaces DOM (resets scroll to 0)
  // and a post-paint useEffect snaps it back to bottom on the next frame.
  useLayoutEffect(() => {
    if (streaming && codeScrollRef.current && !userScrolledRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [streaming, code]);

  // Let the user scroll up during streaming without fighting auto-scroll
  const handleCodeScroll = useCallback(() => {
    if (!streaming || !codeScrollRef.current) return;
    const el = codeScrollRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledRef.current = !isNearBottom;
  }, [streaming]);

  // Reset scroll override when streaming ends
  useEffect(() => {
    if (!streaming) {
      userScrolledRef.current = false;
    }
  }, [streaming]);

  const highlightLanguage = mapLanguage(language);
  const canApply = Boolean(fileId && fileName && onApply);
  const canSave = Boolean(onSave && fileName);

  /* ── Actions ───────────────────────────────────────────────────────────── */

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable — silently ignore */
    }
  }, [code]);

  const handleApplyClick = useCallback(() => {
    setShowDiffPreview(true);
  }, []);

  const handleConfirmApply = useCallback(() => {
    if (onApply && fileId && fileName) {
      onApply(code, fileId, fileName);
      // Show undo toast for 5 seconds
      if (previousContent !== undefined && onUndoApply) {
        setShowUndoToast(true);
        setTimeout(() => setShowUndoToast(false), 5000);
      }
    }
    setShowDiffPreview(false);
  }, [onApply, code, fileId, fileName, previousContent, onUndoApply]);

  const handleCancelApply = useCallback(() => {
    setShowDiffPreview(false);
  }, []);

  const handleSave = useCallback(() => {
    if (onSave && fileName) {
      onSave(code, fileName);
    }
  }, [onSave, code, fileName]);

  /* ── Derived values ────────────────────────────────────────────────────── */

  const lines = code.split('\n');

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="group/codeblock relative my-2 rounded-lg border ide-border ide-surface-panel overflow-hidden">
      {/* ── Header / action bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b ide-border ide-surface-panel px-3 py-1.5">
        {/* File name or language label */}
        <div className="flex items-center gap-1.5 text-xs ide-text-muted">
          <FileCode className="h-3.5 w-3.5 ide-text-3" />
          <span className="font-mono truncate max-w-[200px]">
            {fileName || language || 'code'}
          </span>
        </div>

        {/* Action buttons — subtle until hover */}
        <div className="flex items-center gap-1 opacity-60 group-hover/codeblock:opacity-100 transition-opacity">
          {/* Line count badge for large blocks */}
          {lines.length > 50 && (
            <span className="text-[10px] tabular-nums ide-text-quiet font-mono px-1.5 py-0.5">
              {lines.length} lines
            </span>
          )}
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs ide-text-muted ide-hover hover:ide-text transition-colors"
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Apply (only when fileId + fileName + handler exist) */}
          {canApply && (
            <button
              type="button"
              onClick={handleApplyClick}
              disabled={showDiffPreview}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs ide-text-muted hover:bg-sky-500/20 dark:hover:bg-sky-500/20 hover:text-sky-600 dark:hover:text-sky-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Apply code changes"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Apply</span>
            </button>
          )}

          {/* Save */}
          {canSave && (
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs ide-text-muted hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors"
              aria-label="Save as new file"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Syntax-highlighted code ─────────────────────────────────────── */}
      <div ref={codeScrollRef} onScroll={handleCodeScroll} className={`relative overflow-y-auto overflow-x-hidden ${streaming ? 'max-h-[200px]' : 'max-h-[400px]'}`}>
        <SyntaxHighlighter
          language={highlightLanguage}
          style={isDark ? vscDarkPlus : oneLight}
          showLineNumbers
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: 'oklch(0.446 0.03 256)',
            fontSize: '0.75rem',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            padding: '0.75rem 0',
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: '1.5',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
          codeTagProps={{
            style: {
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>

      {/* ── Inline diff preview (P4 verification) ──────────────────────── */}
      <AnimatePresence>
        {showDiffPreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t ide-border"
          >
            <div className="ide-surface p-3">
              {/* Diff header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
                  <span className="text-xs font-medium ide-text-2">
                    Preview changes to{' '}
                    <span className="font-mono text-sky-600 dark:text-sky-400">{fileName}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelApply}
                  className="p-0.5 rounded ide-text-3 hover:ide-text-2 ide-hover transition-colors"
                  aria-label="Close diff preview"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Unified diff view — all lines shown as additions */}
              <div className="rounded border ide-border-subtle ide-surface-panel overflow-y-auto overflow-x-hidden max-h-[300px] font-mono text-xs leading-[1.6]">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className="flex hover:bg-emerald-500/[0.08]"
                  >
                    {/* Line number */}
                    <span className="select-none w-8 text-right pr-2 py-px text-emerald-700/80 flex-shrink-0 border-r ide-border-subtle">
                      {i + 1}
                    </span>
                    {/* Diff gutter (+) */}
                    <span className="select-none w-5 text-center py-px text-emerald-500/70 flex-shrink-0">
                      +
                    </span>
                    {/* Line content */}
                    <span className="py-px px-2 text-emerald-300/90 whitespace-pre-wrap break-words flex-1 min-w-0 bg-emerald-500/[0.04]">
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </div>

              {/* Confirm / Cancel */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[10px] ide-text-3 mr-auto">
                  {lines.length} line{lines.length !== 1 ? 's' : ''} will replace the file content. You can undo from the editor.
                </span>
                <button
                  type="button"
                  onClick={handleCancelApply}
                  className="rounded px-3 py-1.5 text-xs font-medium ide-text-muted ide-hover hover:ide-text border ide-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApply}
                  className="rounded px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  Confirm Apply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Undo toast after applying */}
      <AnimatePresence>
        {showUndoToast && previousContent !== undefined && onUndoApply && fileId && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mt-1 flex items-center justify-between gap-2 rounded-lg ide-surface-inset border ide-border px-3 py-1.5 text-xs"
          >
            <span className="ide-text-muted">Changes applied to {fileName}</span>
            <button
              type="button"
              onClick={() => {
                onUndoApply(fileId, previousContent);
                setShowUndoToast(false);
              }}
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
