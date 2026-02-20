'use client';

import React from 'react';

interface FileSearchResult {
  fileName: string;
  fileType: string;
  score: number;
  source: 'semantic' | 'fuzzy';
}

interface FileSearchCardProps {
  query: string;
  results: FileSearchResult[];
  totalResults: number;
}

export function FileSearchCard({ query, results, totalResults }: FileSearchCardProps) {
  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-stone-400 dark:text-stone-500 text-xs">search</span>
        <span className="text-stone-900 dark:text-white text-xs font-medium truncate">&ldquo;{query}&rdquo;</span>
        <span className="text-stone-400 dark:text-stone-500 text-xs ml-auto">
          {totalResults} result{totalResults !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1.5">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sky-600 dark:text-sky-400 font-mono text-xs truncate">{r.fileName}</span>
            <span className="text-stone-400 dark:text-stone-500 text-xs">({r.fileType})</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                r.source === 'semantic'
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400'
              }`}
            >
              {r.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
