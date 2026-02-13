'use client';

import type { Suggestion } from '@/lib/types/suggestion';
import { formatRelativeTime } from '@/hooks/useProjectFiles';

interface SuggestionHistoryProps {
  suggestions: Suggestion[];
  onUndo: (id: string) => void;
  isUndoing?: boolean;
}

function StatusBadge({ status }: { status: Suggestion['status'] }) {
  const colors = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    applied: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    edited: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/30',
    undone: 'ide-surface-inset ide-text-muted border ide-border',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function SuggestionHistory({
  suggestions,
  onUndo,
  isUndoing = false,
}: SuggestionHistoryProps) {
  const sortedSuggestions = [...suggestions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sortedSuggestions.length === 0) {
    return (
      <div className="text-center py-6 text-sm ide-text-muted">
        No suggestion history
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sortedSuggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className="border ide-border rounded-lg ide-surface-panel p-3 space-y-2"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm ide-text line-clamp-2">
                {suggestion.explanation}
              </p>
            </div>
            <StatusBadge status={suggestion.status} />
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs ide-text-muted">
            <span>{formatRelativeTime(suggestion.created_at)}</span>
            {suggestion.file_paths.length > 0 && (
              <span className="truncate max-w-[200px]">
                {suggestion.file_paths[0]}
                {suggestion.file_paths.length > 1 &&
                  ` +${suggestion.file_paths.length - 1}`}
              </span>
            )}
          </div>

          {/* Actions */}
          {suggestion.status === 'applied' && (
            <div className="pt-2 border-t ide-border">
              <button
                type="button"
                onClick={() => onUndo(suggestion.id)}
                disabled={isUndoing}
                className="px-3 py-1 text-xs rounded ide-surface-inset ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUndoing ? 'Undoing…' : 'Undo'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
