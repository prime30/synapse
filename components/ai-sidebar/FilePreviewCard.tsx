'use client';

import React, { useState } from 'react';

interface FilePreviewCardProps {
  fileName: string;
  content: string;
  language: string;
  lineCount: number;
}

export function FilePreviewCard({ fileName, content, language, lineCount }: FilePreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LINES = 20;
  const lines = content.split('\n');
  const truncated = lines.length > MAX_LINES && !expanded;
  const displayContent = truncated ? lines.slice(0, MAX_LINES).join('\n') : content;

  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-white/10">
        <span className="text-sky-600 dark:text-sky-400 font-mono text-xs truncate">{fileName}</span>
        <span className="text-stone-400 dark:text-stone-500 text-xs ml-auto">
          {lineCount} line{lineCount !== 1 ? 's' : ''} &middot; {language}
        </span>
      </div>

      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="text-stone-700 dark:text-stone-300 font-mono">{displayContent}</code>
      </pre>

      {truncated && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-3 py-1.5 text-xs text-sky-600 dark:text-sky-400 hover:bg-stone-100 dark:hover:bg-white/5 border-t border-stone-200 dark:border-white/10"
        >
          Show all {lines.length} lines
        </button>
      )}
    </div>
  );
}
