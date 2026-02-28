'use client';

import { useCallback } from 'react';

export interface EmptyStateSuggestion {
  label: string;
  prompt: string;
  icon?: string;
}

export interface EmptyStateCoachingProps {
  suggestions: EmptyStateSuggestion[];
  onSelect: (prompt: string) => void;
}

export function EmptyStateCoaching({
  suggestions,
  onSelect,
}: EmptyStateCoachingProps) {
  const handleClick = useCallback(
    (prompt: string) => {
      onSelect(prompt);
    },
    [onSelect]
  );

  const displaySuggestions = suggestions.slice(0, 3);

  if (displaySuggestions.length === 0) return null;

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-white mb-4">
        Try asking...
      </h2>
      <div className="w-full max-w-md space-y-2">
        {displaySuggestions.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            onClick={() => handleClick(suggestion.prompt)}
            className="
              w-full px-4 py-3
              bg-stone-50 dark:bg-[#141414]
              border border-stone-200 dark:border-[#2a2a2a]
              rounded-lg cursor-pointer
              hover:bg-stone-100 dark:hover:bg-[#1e1e1e]
              transition-colors text-left
              flex items-center gap-3
            "
          >
            {suggestion.icon && (
              <span className="text-lg shrink-0" aria-hidden>
                {suggestion.icon}
              </span>
            )}
            <span className="text-sm text-stone-700 dark:text-stone-300">
              {suggestion.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
