'use client';

import { useEffect, useCallback } from 'react';
import { useFileEditor } from '@/hooks/useFileEditor';
import { CollaborativeCursors } from '@/components/editor/CollaborativeCursors';
import type { RemoteCursor } from '@/hooks/useRemoteCursors';

interface FileEditorProps {
  fileId: string | null;
  onSave?: () => void;
  onMarkDirty?: (dirty: boolean) => void;
  cursors?: RemoteCursor[];
}

export function FileEditor({
  fileId,
  onSave,
  onMarkDirty,
  cursors = [],
}: FileEditorProps) {
  const {
    content,
    setContent,
    isDirty,
    isLoading,
    save,
    cancel,
  } = useFileEditor(fileId);

  useEffect(() => {
    onMarkDirty?.(isDirty);
  }, [isDirty, onMarkDirty]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save().then(onSave).catch(() => {});
      }
    },
    [save, onSave]
  );

  if (!fileId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Select a file
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center gap-2 p-2 border-b border-gray-700 bg-gray-900/50">
        <button
          type="button"
          onClick={() => save().then(onSave).catch(() => {})}
          disabled={!isDirty}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={!isDirty}
          className="px-3 py-1 text-sm text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        {isDirty && (
          <span className="text-xs text-amber-400">Unsaved changes</span>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        <CollaborativeCursors cursors={cursors} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 w-full h-full min-h-[200px] p-4 font-mono text-sm text-gray-200 bg-gray-900 border-0 resize-none focus:outline-none focus:ring-0"
          spellCheck={false}
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}
