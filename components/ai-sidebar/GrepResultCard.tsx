'use client';

import React, { useState } from 'react';

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

interface GrepResultCardProps {
  pattern: string;
  matches: GrepMatch[];
  totalMatches: number;
}

export function GrepResultCard({ pattern, matches, totalMatches }: GrepResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const displayMatches = expanded ? matches : matches.slice(0, 5);
  const hasMore = matches.length > 5;

  return (
    <div className="rounded-lg border border-stone-200 dark:border-[#2a2a2a] bg-stone-50 dark:bg-white/5 p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-stone-400 dark:text-stone-500 font-mono text-xs">grep</span>
        <code className="text-stone-900 dark:text-white font-mono text-xs bg-stone-100 dark:bg-[#1e1e1e] px-1.5 py-0.5 rounded">
          {pattern}
        </code>
        <span className="text-stone-400 dark:text-stone-500 text-xs ml-auto">
          {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
        </span>
      </div>

      <div className="space-y-1">
        {displayMatches.map((m, i) => (
          <div key={i} className="flex gap-2 font-mono text-xs leading-relaxed">
            <span className="text-sky-600 dark:text-sky-400 shrink-0 truncate max-w-[200px]" title={m.file}>
              {m.file}
            </span>
            <span className="text-stone-400 dark:text-stone-500 shrink-0">:{m.line}</span>
            <span className="text-stone-600 dark:text-stone-400 truncate">{m.content}</span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-sky-600 dark:text-sky-400 hover:underline"
        >
          {expanded ? 'Show less' : `Show all ${matches.length} matches`}
        </button>
      )}
    </div>
  );
}
