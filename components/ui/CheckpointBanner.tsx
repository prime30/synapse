'use client';

import { useState } from 'react';

interface CheckpointBannerProps {
  fileNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isCreating?: boolean;
}

/**
 * Pre-apply confirmation banner showing which files will be checkpointed.
 * Design system compliant: ide-surface-panel, ide-border, accent green.
 */
export function CheckpointBanner({
  fileNames,
  onConfirm,
  onCancel,
  isCreating = false,
}: CheckpointBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const displayFiles = expanded ? fileNames : fileNames.slice(0, 3);

  return (
    <div className="border ide-border rounded-lg ide-surface-panel p-3 space-y-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
        </svg>
        <span className="text-sm ide-text font-medium">
          Checkpoint will save {fileNames.length} file{fileNames.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1 pl-6">
        {displayFiles.map((name, i) => (
          <div key={i} className="text-xs ide-text-muted font-mono truncate">{name}</div>
        ))}
        {fileNames.length > 3 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
          >
            +{fileNames.length - 3} more...
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isCreating}
          className="px-3 py-1.5 text-xs rounded bg-[#28CD56] text-white hover:bg-[#28CD56]/90 disabled:opacity-50 transition-colors font-medium"
        >
          {isCreating ? 'Saving...' : 'Save & Apply'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="px-3 py-1.5 text-xs rounded ide-surface-inset ide-text hover:ide-hover disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
