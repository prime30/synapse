'use client';

import React, { useState } from 'react';

interface PreviewNavToastProps {
  path: string;
  description?: string;
}

export function PreviewNavToast({ path, description }: PreviewNavToastProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="my-2 rounded-lg border ide-border ide-surface-inset px-3 py-2 flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <svg
        className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15,3 21,3 21,9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      <span className="flex-1 text-[11px] ide-text-2">
        Preview navigated to <span className="font-mono text-sky-600 dark:text-sky-400">{path}</span>
        {description && <span className="ide-text-muted ml-1">— {description}</span>}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ide-text-muted hover:ide-text-2 transition-colors p-0.5"
        aria-label="Dismiss"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
