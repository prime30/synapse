'use client';

import { useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useFileEditor } from '@/hooks/useFileEditor';
import { CollaborativeCursors } from '@/components/editor/CollaborativeCursors';
import { MonacoEditor, type EditorLanguage } from '@/components/editor/MonacoEditor';
import { useAgentEdits } from '@/hooks/useAgentEdits';
import type { RemoteCursor } from '@/hooks/useRemoteCursors';
import { useCollaborativeEditor, type CollaborativePeer } from '@/hooks/useCollaborativeEditor';
import type { CollaborationUser } from '@/lib/collaboration/yjs-supabase-provider';
import type { editor } from 'monaco-editor';

export interface FileEditorHandle {
  save: () => Promise<void>;
  cancel: () => void;
  /** Scroll the editor to reveal a specific line (1-based). No-op if editor is not mounted. */
  revealLine: (lineNumber: number) => void;
}

interface FileEditorProps {
  fileId: string | null;
  fileType?: 'liquid' | 'javascript' | 'css' | 'other';
  onSave?: () => void;
  onMarkDirty?: (dirty: boolean) => void;
  cursors?: RemoteCursor[];
  /** When true, Monaco is read-only and save is disabled */
  locked?: boolean;
  /** Called when the user's text selection changes (text + line range for chat pill) */
  onSelectionChange?: (selection: { text: string; startLine: number; endLine: number } | null) => void;
  /** Called with selection position for quick actions toolbar positioning */
  onSelectionPosition?: (pos: { top: number; left: number; text: string } | null) => void;
  /** Called when file content changes (for breadcrumb, status bar) */
  onContentChange?: (content: string) => void;
  /** EPIC 5: Called when user triggers "Fix with AI" on a diagnostic */
  onFixWithAI?: (message: string, line: number) => void;
  /** When true, enable collaborative editing via Yjs */
  collaborative?: boolean;
  /** Project ID for collaborative room scoping */
  projectId?: string;
  /** Current user info for collaboration awareness */
  collaborationUser?: CollaborationUser;
  /** Called when collaborative peers change */
  onPeersChange?: (peers: CollaborativePeer[]) => void;
  /** Called when collaboration connection status changes */
  onConnectionStatusChange?: (status: string) => void;
  /** Called when cursor position changes in the editor */
  onCursorPositionChange?: (position: { line: number; column: number }) => void;
  /** File path for AI inline completions context (e.g. sections/hero.liquid). */
  filePath?: string | null;
  /** Enable Cursor-like inline (ghost) completions. Default true when filePath is set. */
  enableInlineCompletions?: boolean;
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
    collaborative = false,
    projectId,
    collaborationUser,
    onPeersChange,
    onConnectionStatusChange,
    onCursorPositionChange,
    filePath = null,
    enableInlineCompletions = true,
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

  const { clearEdits: clearAgentEdits, getEdits: getAgentEdits } = useAgentEdits();

  // Ref to the underlying Monaco editor instance for imperative operations
  const monacoEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    monacoEditorRef.current = editorInstance;
  }, []);

  // Debounce content changes to avoid re-render storms during paste
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSetContent = useMemo(() => {
    if (collaborative || locked || isLoading) return () => {};
    return (value: string) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setContent(value);
        if (filePath) clearAgentEdits(filePath);
      }, 50);
    };
  }, [collaborative, locked, isLoading, setContent, filePath, clearAgentEdits]);

  // Collaborative editor (when enabled)
  const collab = useCollaborativeEditor({
    projectId: projectId || '',
    fileId: fileId || '',
    initialContent: content,
    user: collaborationUser || { userId: '', name: 'Anonymous', color: 'oklch(0.718 0.174 253)' },
    solo: !collaborative,
  });

  // Use collaborative content/save when collaboration is on
  const effectiveContent = collaborative ? collab.content : content;
  const effectiveDirty = collaborative ? collab.isDirty : isDirty;
  const effectiveSave = collaborative ? collab.save : save;
  const effectiveCancel = collaborative ? collab.revert : cancel;

  // Expose save/cancel/revealLine via imperative handle
  useImperativeHandle(ref, () => ({
    save: async () => {
      if (locked) return;
      await effectiveSave();
      onSave?.();
    },
    cancel: () => {
      effectiveCancel();
    },
    revealLine: (lineNumber: number) => {
      monacoEditorRef.current?.revealLineInCenter(lineNumber);
    },
  }), [effectiveSave, effectiveCancel, onSave, locked]);

  useEffect(() => {
    onMarkDirty?.(effectiveDirty);
  }, [effectiveDirty, onMarkDirty]);

  // Pipe content up for breadcrumb / status bar
  useEffect(() => {
    onContentChange?.(effectiveContent);
  }, [effectiveContent, onContentChange]);

  // Report collaborative peers to parent
  useEffect(() => {
    if (collaborative && onPeersChange) {
      onPeersChange(collab.peers);
    }
  }, [collaborative, collab.peers, onPeersChange]);

  // Report connection status to parent
  useEffect(() => {
    if (collaborative && onConnectionStatusChange) {
      onConnectionStatusChange(collab.status);
    }
  }, [collaborative, collab.status, onConnectionStatusChange]);

  const handleSaveKeyDown = useCallback(() => {
    if (locked) return;
    effectiveSave().then(onSave).catch(() => {});
  }, [effectiveSave, onSave, locked]);

  if (!fileId) {
    return (
      <div className="flex items-center justify-center h-64 ide-text-muted">
        Select a file
      </div>
    );
  }

  // Always render MonacoEditor so its dynamic import starts in parallel with file fetch.
  // While loading, pass empty content and read-only mode.
  return (
    <div className="flex flex-col h-full relative">
      {/* Loading overlay — fades out once content arrives */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center ide-surface/80 backdrop-blur-[1px] pointer-events-none">
          <div className="animate-pulse ide-text-muted text-sm">Loading...</div>
        </div>
      )}
      {/* Editor */}
      <div className="flex-1 min-h-0 relative">
        <CollaborativeCursors cursors={cursors} />
        <MonacoEditor
          value={collaborative ? undefined : (isLoading ? '' : effectiveContent)}
          onChange={debouncedSetContent}
          language={fileType as EditorLanguage}
          onSaveKeyDown={handleSaveKeyDown}
          readOnly={locked || isLoading}
          height="100%"
          className="flex-1 w-full min-h-[200px]"
          onSelectionChange={onSelectionChange}
          onSelectionPosition={onSelectionPosition}
          onCursorPositionChange={onCursorPositionChange}
          onFixWithAI={onFixWithAI}
          onEditorMount={(editorInstance) => {
            handleEditorMount(editorInstance);
            if (collaborative) collab.bind(editorInstance);
          }}
          enableInlineCompletions={enableInlineCompletions}
          filePathForCompletions={filePath}
          agentEdits={filePath ? getAgentEdits(filePath) : undefined}
        />
      </div>
    </div>
  );
});
