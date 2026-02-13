'use client';

import type { Suggestion } from '@/lib/types/suggestion';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isApplying?: boolean;
  isRejecting?: boolean;
}

function SourceBadge({ source }: { source: Suggestion['source'] }) {
  const colors = {
    ai_model: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    static_rule: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/30',
    hybrid: 'bg-green-500/20 text-green-400 border-green-500/30',
  };

  const labels = {
    ai_model: 'AI',
    static_rule: 'Static',
    hybrid: 'Hybrid',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[source]}`}
    >
      {labels[source]}
    </span>
  );
}

function ScopeIndicator({ scope }: { scope: Suggestion['scope'] }) {
  const labels = {
    single_line: 'Single-line',
    multi_line: 'Multi-line',
    multi_file: 'Multi-file',
  };

  return (
    <span className="text-xs ide-text-muted">
      {labels[scope]}
    </span>
  );
}

export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  isApplying = false,
  isRejecting = false,
}: SuggestionCardProps) {
  const canInteract = suggestion.status === 'pending' && !isApplying && !isRejecting;

  return (
    <div className="border ide-border rounded-lg ide-surface-panel p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source={suggestion.source} />
          <ScopeIndicator scope={suggestion.scope} />
        </div>
        {suggestion.status !== 'pending' && (
          <span className="text-xs ide-text-muted capitalize">
            {suggestion.status}
          </span>
        )}
      </div>

      {/* Explanation */}
      <p className="text-sm ide-text">{suggestion.explanation}</p>

      {/* File paths */}
      {suggestion.file_paths.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs ide-text-muted">Affected files:</span>
          <div className="flex flex-wrap gap-1">
            {suggestion.file_paths.map((path, idx) => (
              <span
                key={idx}
                className="text-xs ide-surface-inset ide-text-muted px-2 py-0.5 rounded font-mono"
              >
                {path}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {canInteract && (
        <div className="flex items-center gap-2 pt-2 border-t ide-border">
          <button
            type="button"
            onClick={() => onAccept(suggestion.id)}
            disabled={isApplying}
            className="flex-1 px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isApplying ? 'Applying…' : 'Accept'}
          </button>
          <button
            type="button"
            onClick={() => onReject(suggestion.id)}
            disabled={isRejecting}
            className="flex-1 px-3 py-1.5 text-sm rounded ide-surface-inset ide-text hover:ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRejecting ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}
