'use client';

import React, { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [showDiffPreview, setShowDiffPreview] = useState(false);

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
    }
    setShowDiffPreview(false);
  }, [onApply, code, fileId, fileName]);

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
    <div className="group/codeblock relative my-2 rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      {/* ── Header / action bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-3 py-1.5">
        {/* File name or language label */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FileCode className="h-3.5 w-3.5 text-gray-500" />
          <span className="font-mono truncate max-w-[200px]">
            {fileName || language || 'code'}
          </span>
        </div>

        {/* Action buttons — subtle until hover */}
        <div className="flex items-center gap-1 opacity-60 group-hover/codeblock:opacity-100 transition-opacity">
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700/60 hover:text-gray-200 transition-colors"
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
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-blue-600/20 hover:text-blue-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors"
              aria-label="Save as new file"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Syntax-highlighted code ─────────────────────────────────────── */}
      <div className="relative overflow-auto max-h-[400px]">
        <SyntaxHighlighter
          language={highlightLanguage}
          style={vscDarkPlus}
          showLineNumbers
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: '#4b5563',
            fontSize: '0.75rem',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            padding: '0.75rem 0',
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: '1.5',
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
            className="overflow-hidden border-t border-gray-800"
          >
            <div className="bg-gray-950/80 p-3">
              {/* Diff header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-gray-300">
                    Preview changes to{' '}
                    <span className="font-mono text-blue-400">{fileName}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelApply}
                  className="p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 transition-colors"
                  aria-label="Close diff preview"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Unified diff view — all lines shown as additions */}
              <div className="rounded border border-gray-800 bg-gray-900/60 overflow-auto max-h-[300px] font-mono text-xs leading-[1.6]">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className="flex hover:bg-emerald-500/[0.08]"
                  >
                    {/* Line number */}
                    <span className="select-none w-8 text-right pr-2 py-px text-emerald-700/80 flex-shrink-0 border-r border-gray-800">
                      {i + 1}
                    </span>
                    {/* Diff gutter (+) */}
                    <span className="select-none w-5 text-center py-px text-emerald-500/70 flex-shrink-0">
                      +
                    </span>
                    {/* Line content */}
                    <span className="py-px px-2 text-emerald-300/90 whitespace-pre flex-1 bg-emerald-500/[0.04]">
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </div>

              {/* Confirm / Cancel */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[10px] text-gray-500 mr-auto">
                  {lines.length} line{lines.length !== 1 ? 's' : ''} will be
                  applied
                </span>
                <button
                  type="button"
                  onClick={handleCancelApply}
                  className="rounded px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-700 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApply}
                  className="rounded px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                >
                  Confirm Apply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
