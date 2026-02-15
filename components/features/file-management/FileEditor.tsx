'use client';

import { useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useFileEditor } from '@/hooks/useFileEditor';
import { CollaborativeCursors } from '@/components/editor/CollaborativeCursors';
import { MonacoEditor, type EditorLanguage } from '@/components/editor/MonacoEditor';
import type { RemoteCursor } from '@/hooks/useRemoteCursors';

export interface FileEditorHandle {
  save: () => Promise<void>;
  cancel: () => void;
}

interface FileEditorProps {
  fileId: string | null;
  fileType?: 'liquid' | 'javascript' | 'css' | 'other';
  onSave?: () => void;
  onMarkDirty?: (dirty: boolean) => void;
  cursors?: RemoteCursor[];
  /** When true, Monaco is read-only and save is disabled */
  locked?: boolean;
  /** Called when the user's text selection changes in the editor (EPIC 1c: selection injection) */
  onSelectionChange?: (selectedText: string | null) => void;
  /** Called with selection position for quick actions toolbar positioning */
  onSelectionPosition?: (pos: { top: number; left: number; text: string } | null) => void;
  /** Called when file content changes (for breadcrumb, status bar) */
  onContentChange?: (content: string) => void;
  /** EPIC 5: Called when user triggers "Fix with AI" on a diagnostic */
  onFixWithAI?: (message: string, line: number) => void;
}

export const FileEditor = forwardRef<FileEditorHandle, FileEditorProps>(function FileEditor(
  {
    fileId,
    fileType = 'liquid',
    onSave,
    onMarkDirty,
    cursors = [],
    locked = false,
    onSelectionChange,
    onSelectionPosition,
    onContentChange,
    onFixWithAI,
  },
  ref
) {
  const {
    content,
    setContent,
    isDirty,
    isLoading,
    save,
    cancel,
  } = useFileEditor(fileId);

  // Expose save/cancel via imperative handle
  useImperativeHandle(ref, () => ({
    save: async () => {
      if (locked) return;
      await save();
      onSave?.();
    },
    cancel: () => {
      cancel();
    },
  }), [save, cancel, onSave, locked]);

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
          onSelectionPosition={onSelectionPosition}
          onFixWithAI={onFixWithAI}
        />
      </div>
    </div>
  );
});
