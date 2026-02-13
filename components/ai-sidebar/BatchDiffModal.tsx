'use client';

import { useState, useCallback, useMemo } from 'react';
import { DiffPreview } from '@/components/features/suggestions/DiffPreview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single file change to display in the batch diff modal. */
export interface BatchDiffEntry {
  fileId: string;
  fileName: string;
  originalContent: string;
  newContent: string;
  /** Short description of what changed. */
  description?: string;
}

interface BatchDiffModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Title for the modal header. */
  title: string;
  /** All file changes to review. */
  entries: BatchDiffEntry[];
  /** Called when user clicks "Apply All" (with selected entries). */
  onApplyAll: (selectedEntries: BatchDiffEntry[]) => void;
  /** Called to undo all applied changes (batch undo). */
  onUndoAll?: (entries: BatchDiffEntry[]) => void;
  /** Called when user closes/cancels the modal. */
  onClose: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// FileEntry sub-component
// ---------------------------------------------------------------------------

function FileEntryItem({
  entry,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}: {
  entry: BatchDiffEntry;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className="border-b ide-border-subtle last:border-b-0">
      {/* File header row */}
      <div className="flex items-center gap-2 px-4 py-2 ide-hover">
        {/* Checkbox */}
        <button
          type="button"
          onClick={onToggleSelect}
          className={`
            flex-shrink-0 w-4 h-4 rounded border transition-colors
            ${
              isSelected
                ? 'bg-sky-500/20 dark:bg-sky-500/20 border-sky-500/40 text-sky-600 dark:text-sky-400'
                : 'ide-border hover:border-stone-300 dark:hover:border-white/20 text-transparent'
            }
            flex items-center justify-center
          `}
          aria-label={isSelected ? `Deselect ${entry.fileName}` : `Select ${entry.fileName}`}
        >
          {isSelected && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* File name */}
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 text-left flex items-center gap-2 min-w-0"
        >
          <svg
            className={`w-3 h-3 ide-text-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-mono ide-text-2 truncate">
            {entry.fileName}
          </span>
        </button>

        {/* Description */}
        {entry.description && (
          <span className="flex-shrink-0 text-[10px] ide-text-3 truncate max-w-[200px]">
            {entry.description}
          </span>
        )}
      </div>

      {/* Diff preview (collapsible) */}
      {isExpanded && (
        <div className="px-4 pb-3">
          <div className="rounded border ide-border-subtle overflow-hidden">
            <DiffPreview
              originalCode={entry.originalContent}
              suggestedCode={entry.newContent}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * BatchDiffModal — multi-file diff view with per-file accept/reject
 * checkboxes and an "Apply All" button.
 *
 * "Apply All" uses batch undo from EPIC 8 so a single undo reverts all changes.
 */
export function BatchDiffModal({
  isOpen,
  title,
  entries,
  onApplyAll,
  onUndoAll,
  onClose,
  className = '',
}: BatchDiffModalProps) {
  // Track which files are selected for apply
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    new Set(entries.map((e) => e.fileId)),
  );
  // Track which files are expanded to show diff
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Reset selections when entries change
  const entryKey = entries.map((e) => e.fileId).join(',');
  useMemo(() => {
    setSelectedIds(new Set(entries.map((e) => e.fileId)));
    setExpandedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);

  const toggleSelect = useCallback((fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((fileId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entries.map((e) => e.fileId)));
  }, [entries]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(entries.map((e) => e.fileId)));
  }, [entries]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Track applied state for toast
  const [appliedEntries, setAppliedEntries] = useState<BatchDiffEntry[] | null>(null);

  const handleApplyAll = useCallback(() => {
    const selected = entries.filter((e) => selectedIds.has(e.fileId));
    if (selected.length > 0) {
      onApplyAll(selected);
      setAppliedEntries(selected);
      // Auto-dismiss toast after 6 seconds
      setTimeout(() => setAppliedEntries(null), 6000);
    }
  }, [entries, selectedIds, onApplyAll]);

  const handleUndoAll = useCallback(() => {
    if (appliedEntries && onUndoAll) {
      onUndoAll(appliedEntries);
      setAppliedEntries(null);
    }
  }, [appliedEntries, onUndoAll]);

  const selectedCount = selectedIds.size;
  const totalCount = entries.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="ide-overlay backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative flex flex-col ide-surface ide-border
          rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh]
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b ide-border-subtle flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold ide-text">{title}</h2>
            <p className="text-[10px] ide-text-3 mt-0.5">
              {selectedCount} of {totalCount} file{totalCount !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 ide-text-3 ide-hover hover:ide-text-2 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-2 border-b ide-border-subtle flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={selectAll}
              className="text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 transition-colors"
            >
              Select all
            </button>
            <span className="ide-text-3">|</span>
            <button
              type="button"
              onClick={selectNone}
              className="text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 transition-colors"
            >
              Select none
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={expandAll}
              className="ide-text-muted hover:ide-text-2 transition-colors"
            >
              Expand all
            </button>
            <span className="ide-text-3">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="ide-text-muted hover:ide-text-2 transition-colors"
            >
              Collapse all
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs ide-text-3">
              No file changes to review
            </div>
          ) : (
            entries.map((entry) => (
              <FileEntryItem
                key={entry.fileId}
                entry={entry}
                isSelected={selectedIds.has(entry.fileId)}
                isExpanded={expandedIds.has(entry.fileId)}
                onToggleSelect={() => toggleSelect(entry.fileId)}
                onToggleExpand={() => toggleExpand(entry.fileId)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col border-t ide-border-subtle flex-shrink-0">
          {/* Applied toast */}
          {appliedEntries && (
            <div className="flex items-center justify-between gap-2 px-5 py-2 bg-emerald-500/10 border-b ide-border-subtle">
              <span className="text-xs ide-text-2">
                Applied {appliedEntries.length} file{appliedEntries.length !== 1 ? 's' : ''}
              </span>
              {onUndoAll && (
                <button
                  type="button"
                  onClick={handleUndoAll}
                  className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  Undo all
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-1.5 text-xs font-medium ide-text-muted ide-hover hover:ide-text transition-colors"
            >
              {appliedEntries ? 'Done' : 'Cancel'}
            </button>
            {!appliedEntries && (
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={selectedCount === 0}
                className={`
                  rounded px-4 py-1.5 text-xs font-medium transition-colors
                  ${
                    selectedCount > 0
                      ? 'text-white bg-sky-600 hover:bg-sky-500'
                      : 'ide-text-3 ide-surface-inset cursor-not-allowed'
                  }
                `}
              >
                Apply {selectedCount} file{selectedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
