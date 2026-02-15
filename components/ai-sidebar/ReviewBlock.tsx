'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X } from 'lucide-react';
import { CodeEditCard } from './CodeEditCard';
import { safeTransition } from '@/lib/accessibility';

// -- Types --

export interface CodeEdit {
  filePath: string;
  reasoning?: string;
  newContent: string;
  originalContent?: string;
  status: 'pending' | 'applied' | 'rejected';
}

interface ReviewBlockProps {
  edits: CodeEdit[];
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenFile?: (filePath: string) => void;
  onEditStatusChange?: (editIndex: number, status: 'applied' | 'rejected') => void;
}

// -- Component --

export function ReviewBlock({
  edits,
  onApplyCode,
  resolveFileId,
  onOpenFile,
  onEditStatusChange,
}: ReviewBlockProps) {
  const [expanded, setExpanded] = useState(true);

  const stats = useMemo(() => {
    const pending = edits.filter((e) => e.status === 'pending').length;
    const applied = edits.filter((e) => e.status === 'applied').length;
    const rejected = edits.filter((e) => e.status === 'rejected').length;
    return { pending, applied, rejected, total: edits.length };
  }, [edits]);

  const allResolved = stats.pending === 0;

  const handleAcceptAll = useCallback(() => {
    edits.forEach((edit, i) => {
      if (edit.status === 'pending') {
        const fileId = resolveFileId?.(edit.filePath) ?? edit.filePath;
        onApplyCode?.(edit.newContent, fileId, edit.filePath);
        onEditStatusChange?.(i, 'applied');
      }
    });
  }, [edits, onApplyCode, resolveFileId, onEditStatusChange]);

  const handleRejectAll = useCallback(() => {
    edits.forEach((edit, i) => {
      if (edit.status === 'pending') {
        onEditStatusChange?.(i, 'rejected');
      }
    });
  }, [edits, onEditStatusChange]);

  if (edits.length === 0) return null;

  return (
    <div className="my-2 rounded-lg border ide-border-subtle overflow-hidden" role="region" aria-label={`${edits.length} file change(s)`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 ide-surface-inset border-b ide-border-subtle">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown className={`h-3.5 w-3.5 ide-text-3 transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
          <span className="text-xs font-medium ide-text-2" aria-live="polite">
            {stats.total} file{stats.total !== 1 ? 's' : ''} changed
          </span>
          {stats.applied > 0 && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              {stats.applied} applied
            </span>
          )}
          {stats.rejected > 0 && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20">
              {stats.rejected} rejected
            </span>
          )}
          {stats.pending > 0 && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20">
              {stats.pending} pending
            </span>
          )}
        </button>

        {!allResolved && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRejectAll}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none"
              aria-label="Reject all changes"
            >
              <X className="h-3 w-3" />
              Reject All
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:outline-none"
              aria-label="Accept all changes"
            >
              <Check className="h-3 w-3" />
              Accept All
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={safeTransition(0.15)}
            className="overflow-hidden"
          >
            <div className="divide-y divide-stone-200 dark:divide-white/5">
              {edits.map((edit, idx) => (
                <CodeEditCard
                  key={`${edit.filePath}-${idx}`}
                  filePath={edit.filePath}
                  reasoning={edit.reasoning}
                  newContent={edit.newContent}
                  originalContent={edit.originalContent}
                  status={edit.status}
                  onApplyCode={onApplyCode}
                  resolveFileId={resolveFileId}
                  onOpenFile={onOpenFile}
                  onStatusChange={(status) => onEditStatusChange?.(idx, status)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
