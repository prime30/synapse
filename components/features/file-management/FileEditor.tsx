'use client';

import { useEffect, useCallback, useState } from 'react';
import { useFileEditor } from '@/hooks/useFileEditor';
import { CollaborativeCursors } from '@/components/editor/CollaborativeCursors';
import { MonacoEditor, type EditorLanguage } from '@/components/editor/MonacoEditor';
import type { RemoteCursor } from '@/hooks/useRemoteCursors';

interface FileEditorProps {
  fileId: string | null;
  fileType?: 'liquid' | 'javascript' | 'css' | 'other';
  onSave?: () => void;
  onMarkDirty?: (dirty: boolean) => void;
  cursors?: RemoteCursor[];
  /** When true, Monaco is read-only and save is disabled */
  locked?: boolean;
  /** Called when user toggles the lock */
  onToggleLock?: () => void;
  /** Called when the user's text selection changes in the editor (EPIC 1c: selection injection) */
  onSelectionChange?: (selectedText: string | null) => void;
  /** Called when file content changes (for breadcrumb, status bar) */
  onContentChange?: (content: string) => void;
  /** EPIC 5: Called when user triggers "Fix with AI" on a diagnostic */
  onFixWithAI?: (message: string, line: number) => void;
}

export function FileEditor({
  fileId,
  fileType = 'liquid',
  onSave,
  onMarkDirty,
  cursors = [],
  locked = false,
  onToggleLock,
  onSelectionChange,
  onContentChange,
  onFixWithAI,
}: FileEditorProps) {
  const {
    content,
    setContent,
    isDirty,
    isLoading,
    save,
    cancel,
  } = useFileEditor(fileId);

  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  useEffect(() => {
    onMarkDirty?.(isDirty);
  }, [isDirty, onMarkDirty]);

  // Pipe content up for breadcrumb / status bar
  useEffect(() => {
    onContentChange?.(content);
  }, [content, onContentChange]);

  const handleSaveKeyDown = useCallback(() => {
    if (locked) return;
    save().then(onSave).catch(() => {});
  }, [save, onSave, locked]);

  const handleLockClick = () => {
    if (locked) {
      // Locked -> show confirmation before unlocking
      setShowUnlockConfirm(true);
    } else {
      // Unlocked -> lock immediately
      onToggleLock?.();
    }
  };

  const handleConfirmUnlock = () => {
    setShowUnlockConfirm(false);
    onToggleLock?.();
  };

  if (!fileId) {
    return (
      <div className="flex items-center justify-center h-64 ide-text-muted">
        Select a file
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse ide-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b ide-border ide-surface-panel">
        <button
          type="button"
          onClick={() => save().then(onSave).catch(() => {})}
          disabled={!isDirty || locked}
          className="px-3 py-1 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={!isDirty || locked}
          className="px-3 py-1 text-sm ide-text-muted ide-hover hover:ide-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        {isDirty && !locked && (
          <span className="text-xs text-amber-400">Unsaved changes</span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Lock toggle */}
        <button
          type="button"
          onClick={handleLockClick}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
            locked
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title={locked ? 'File is locked — click to unlock' : 'Lock file to prevent edits'}
        >
          {locked ? (
            /* Closed padlock */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            /* Open padlock */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
          {locked ? 'Locked' : 'Lock'}
        </button>
      </div>

      {/* Unlock confirmation dialog */}
      {showUnlockConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center ide-overlay backdrop-blur-sm">
          <div className="ide-surface-pop border ide-border rounded-lg p-5 max-w-sm mx-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <h3 className="text-sm font-semibold ide-text">Unlock this file?</h3>
            </div>
            <p className="text-xs ide-text-muted leading-relaxed mb-4">
              Unlocking allows edits from you and AI agents. You can lock it again anytime.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnlockConfirm(false)}
                className="px-3 py-1.5 text-xs rounded ide-surface-panel ide-text-2 ide-hover transition-colors"
              >
                Keep locked
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="px-3 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-500 transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 relative">
        <CollaborativeCursors cursors={cursors} />
        <MonacoEditor
          value={content}
          onChange={locked ? () => {} : setContent}
          language={fileType as EditorLanguage}
          onSaveKeyDown={handleSaveKeyDown}
          readOnly={locked}
          height="100%"
          className="flex-1 w-full min-h-[200px]"
          onSelectionChange={onSelectionChange}
          onFixWithAI={onFixWithAI}
        />
      </div>
    </div>
  );
}
