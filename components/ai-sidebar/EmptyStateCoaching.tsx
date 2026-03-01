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

  const displaySuggestions = suggestions.slice(0, 4);

  if (displaySuggestions.length === 0) return null;

  return (
    <div className="w-full max-w-[320px] mt-4">
      <p className="text-xs ide-text-muted mb-2 text-center">Try asking&hellip;</p>
      <div className="space-y-1.5">
        {displaySuggestions.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            onClick={() => handleClick(suggestion.prompt)}
            className="
              w-full px-3 py-2
              ide-surface
              border ide-border-subtle
              rounded-lg cursor-pointer
              hover:ide-hover
              transition-colors text-left
              flex items-center gap-2
            "
          >
            {suggestion.icon && (
              <span className="text-lg shrink-0" aria-hidden>
                {suggestion.icon}
              </span>
            )}
            <span className="text-sm ide-text-2">
              {suggestion.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
