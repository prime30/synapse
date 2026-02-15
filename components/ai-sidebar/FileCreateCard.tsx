'use client';

import React, { useState } from 'react';

interface FileCreateCardProps {
  fileName: string;
  content: string;
  reasoning?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  onConfirm?: (fileName: string, content: string) => void;
  onCancel?: () => void;
  onStatusChange?: (status: 'confirmed' | 'cancelled') => void;
}

export function FileCreateCard({ fileName, content, reasoning, status, onConfirm, onStatusChange }: FileCreateCardProps) {
  const [localStatus, setLocalStatus] = useState(status);
  const [expanded, setExpanded] = useState(false);

  const effectiveStatus = localStatus !== status ? localStatus : status;

  const handleConfirm = () => {
    onConfirm?.(fileName, content);
    setLocalStatus('confirmed');
    onStatusChange?.('confirmed');
  };

  const handleCancel = () => {
    setLocalStatus('cancelled');
    onStatusChange?.('cancelled');
  };

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        effectiveStatus === 'confirmed' ? 'border-emerald-500/30 ide-surface-inset' :
        effectiveStatus === 'cancelled' ? 'border-red-500/30 ide-surface-inset opacity-60' :
        'ide-border ide-surface-inset'
      }`}
      role="region"
      aria-label={`Create file: ${fileName}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b ide-border-subtle">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <span className="font-mono text-[11px] ide-text-1 truncate">{fileName}</span>
        </div>
        {effectiveStatus === 'confirmed' && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Created</span>
        )}
        {effectiveStatus === 'cancelled' && (
          <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">Cancelled</span>
        )}
      </div>

      {reasoning && (
        <p className="px-3 py-1.5 text-[11px] ide-text-2 border-b ide-border-subtle">{reasoning}</p>
      )}

      <div className="px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] ide-text-muted hover:ide-text-2 transition-colors"
        >
          {expanded ? 'Hide preview' : 'Show file preview'}
        </button>
        {expanded && (
          <pre className="mt-1.5 max-h-[200px] overflow-auto rounded ide-surface-input p-2 text-[11px] font-mono ide-text-2 border ide-border-subtle">
            <code>{content}</code>
          </pre>
        )}
      </div>

      {effectiveStatus === 'pending' && (
        <div className="px-3 py-1.5 border-t ide-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="ide-text-muted hover:ide-text-2 ide-hover rounded text-xs px-2.5 py-1 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="bg-accent text-white hover:bg-accent-hover rounded text-xs font-medium px-3 py-1 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            Create File
          </button>
        </div>
      )}
    </div>
  );
}
