'use client';

interface UndoRedoButtonsProps {
  currentVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: (currentVersionNumber: number) => void;
  onRedo: (currentVersionNumber: number) => void;
  isUndoing?: boolean;
  isRedoing?: boolean;
}

export function UndoRedoButtons({
  currentVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isUndoing = false,
  isRedoing = false,
}: UndoRedoButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onUndo(currentVersion)}
        disabled={!canUndo || isUndoing}
        title="Undo"
        className="inline-flex items-center justify-center w-8 h-8 rounded text-sm ide-surface-inset ide-text ide-hover hover:ide-text disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:ide-text transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onRedo(currentVersion)}
        disabled={!canRedo || isRedoing}
        title="Redo"
        className="inline-flex items-center justify-center w-8 h-8 rounded text-sm ide-surface-inset ide-text ide-hover hover:ide-text disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:ide-text transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M12.207 2.232a.75.75 0 00.025 1.06l4.146 3.958H6.375a5.375 5.375 0 000 10.75H9.25a.75.75 0 000-1.5H6.375a3.875 3.875 0 010-7.75h10.003l-4.146 3.957a.75.75 0 001.036 1.085l5.5-5.25a.75.75 0 000-1.085l-5.5-5.25a.75.75 0 00-1.06.025z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <span className="text-xs ide-text-muted ml-1">
        v{currentVersion}
      </span>
    </div>
  );
}
