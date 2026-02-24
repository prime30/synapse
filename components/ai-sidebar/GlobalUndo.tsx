'use client';

import { useCallback } from 'react';
import { Undo2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface UndoItem {
  id: string;
  description: string;
  filePath: string;
  timestamp: number;
}

export interface GlobalUndoProps {
  undoStack: UndoItem[];
  onUndo: (id: string) => void;
}

export function GlobalUndo({ undoStack, onUndo }: GlobalUndoProps) {
  const lastAction = undoStack[undoStack.length - 1];
  const canUndo = undoStack.length > 0;

  const handleClick = useCallback(() => {
    if (!canUndo) return;
    onUndo(lastAction.id);
  }, [canUndo, lastAction, onUndo]);

  const tooltipContent = lastAction
    ? `${lastAction.description}${lastAction.filePath ? ` — ${lastAction.filePath}` : ''}`
    : 'Nothing to undo';

  return (
    <Tooltip content={tooltipContent}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!canUndo}
        className="
          relative rounded ide-surface-inset ide-border
          text-xs px-2 py-1 flex items-center gap-1.5
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ide-text-3 hover:ide-text-2 ide-hover
        "
        title="Undo last action"
        aria-label="Undo last action"
      >
        <Undo2 className="h-3 w-3 shrink-0" />
        <span>Undo</span>
        {undoStack.length > 0 && (
          <span
            className="
              absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5
              flex items-center justify-center
              text-[10px] font-medium
              bg-stone-300 dark:bg-white/20 text-stone-700 dark:text-stone-200
              rounded-full px-1
            "
            aria-hidden
          >
            {undoStack.length}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
