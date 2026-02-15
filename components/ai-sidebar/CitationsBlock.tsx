'use client';

import React, { useState } from 'react';

interface Citation {
  citedText: string;
  documentTitle: string;
  startIndex?: number;
  endIndex?: number;
}

interface CitationsBlockProps {
  citations: Citation[];
  onOpenFile?: (filePath: string) => void;
}

export function CitationsBlock({ citations, onOpenFile }: CitationsBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!citations || citations.length === 0) return null;

  return (
    <div
      className="mt-2 rounded-lg border ide-border ide-surface-inset overflow-hidden"
      role="region"
      aria-label="Source citations"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left ide-hover transition-colors"
      >
        <svg
          className="h-3 w-3 ide-text-muted shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span className="text-[11px] ide-text-2 font-medium">
          {citations.length} source{citations.length !== 1 ? 's' : ''} cited
        </span>
        <svg
          className={`h-2.5 w-2.5 ide-text-muted ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-stone-200 dark:border-white/10">
          {citations.map((citation, idx) => (
            <div key={idx} className="pt-2">
              <button
                type="button"
                onClick={() => onOpenFile?.(citation.documentTitle)}
                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-mono truncate block max-w-full"
                title={`Open ${citation.documentTitle}`}
              >
                {citation.documentTitle}
                {citation.startIndex !== undefined && (
                  <span className="ide-text-muted ml-1">
                    (index {citation.startIndex})
                  </span>
                )}
              </button>
              <p className="text-[10px] ide-text-muted mt-0.5 line-clamp-2">
                &ldquo;{citation.citedText}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
