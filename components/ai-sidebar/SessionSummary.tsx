'use client';

import { useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface SessionSummaryProps {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  patternsLearned: string[];
  duration: string;
  roleMemoriesSaved?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function SessionSummary({
  filesChanged,
  linesAdded,
  linesRemoved,
  patternsLearned,
  duration,
  roleMemoriesSaved,
  isExpanded = true,
  onToggle,
}: SessionSummaryProps) {
  const handleToggle = useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  const hasPatterns = patternsLearned.length > 0;

  return (
    <div
      className="
        bg-stone-50 dark:bg-white/5
        border border-stone-200 dark:border-[#2a2a2a]
        rounded-lg overflow-hidden
      "
    >
      <button
        type="button"
        onClick={handleToggle}
        className="
          w-full flex items-center justify-between gap-2
          px-3 py-2 text-left
          text-sm font-medium text-stone-900 dark:text-white
          hover:bg-stone-100/50 dark:hover:bg-white/5
          transition-colors
        "
        aria-expanded={isExpanded}
      >
        <span>Session Summary</span>
        {onToggle ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
          )
        ) : null}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          {/* Stats row as compact badges */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200/60 dark:bg-[#1e1e1e] text-stone-600 dark:text-stone-400"
              title="Files changed"
            >
              {filesChanged} file{filesChanged !== 1 ? 's' : ''}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
              title="Lines added"
            >
              +{linesAdded}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
              title="Lines removed"
            >
              −{linesRemoved}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200/60 dark:bg-[#1e1e1e] text-stone-600 dark:text-stone-400"
              title="Duration"
            >
              {duration}
            </span>
            {roleMemoriesSaved != null && roleMemoriesSaved > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                title="Role patterns learned"
              >
                {roleMemoriesSaved} pattern{roleMemoriesSaved !== 1 ? 's' : ''} learned
              </span>
            )}
          </div>

          {/* Patterns learned */}
          {hasPatterns && (
            <div className="flex flex-wrap gap-1">
              {patternsLearned.map((pattern) => (
                <span
                  key={pattern}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-stone-200 dark:border-[#2a2a2a] text-stone-500 dark:text-stone-400"
                >
                  {pattern}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
