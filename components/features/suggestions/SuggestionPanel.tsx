'use client';

import { useState, useCallback } from 'react';
import { useSuggestions } from '@/hooks/useSuggestions';
import { SuggestionCard } from './SuggestionCard';
import { DiffPreview } from './DiffPreview';
import { InlineDiffViewer } from './InlineDiffViewer';
import { SuggestionHistory } from './SuggestionHistory';
import type { SuggestionStatus } from '@/lib/types/suggestion';

interface SuggestionPanelProps {
  projectId: string;
  fileId?: string;
  onGenerate?: () => void;
}

type FilterStatus = 'all' | 'pending' | 'applied' | 'history';

function SkeletonCard() {
  return (
    <div className="border ide-border rounded-lg ide-surface-panel p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-16 h-5 ide-surface-inset rounded" />
        <div className="w-20 h-4 ide-surface-inset rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 ide-surface-inset rounded w-full" />
        <div className="h-4 ide-surface-inset rounded w-3/4" />
      </div>
      <div className="flex gap-2 pt-2 border-t ide-border">
        <div className="flex-1 h-8 ide-surface-inset rounded" />
        <div className="flex-1 h-8 ide-surface-inset rounded" />
      </div>
    </div>
  );
}

export function SuggestionPanel({
  projectId,
  fileId,
  onGenerate,
}: SuggestionPanelProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | undefined>(undefined);
  const [viewingDiffId, setViewingDiffId] = useState<string | null>(null);
  const [useDiffEditor, setUseDiffEditor] = useState(false);

  const {
    suggestions,
    isLoading,
    generate,
    apply,
    reject,
    undo,
    refetch,
    isGenerating,
    isApplying,
    isRejecting,
    isUndoing,
  } = useSuggestions({
    projectId,
    fileId,
    status: filter === 'history' ? undefined : statusFilter,
  });

  const handleGenerate = async () => {
    if (!fileId) return;
    try {
      await generate({ fileId, projectId });
      await refetch();
      onGenerate?.();
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await apply({ id });
      await refetch();
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject(id);
      await refetch();
    } catch (error) {
      console.error('Failed to reject suggestion:', error);
    }
  };

  const handleUndo = useCallback(
    async (id: string) => {
      try {
        await undo(id);
        await refetch();
      } catch (error) {
        console.error('Failed to undo suggestion:', error);
      }
    },
    [undo, refetch]
  );

  // When filter is 'all', statusFilter is undefined so API returns all suggestions
  // When filter is 'pending' or 'applied', statusFilter matches filter so API already filtered
  const filteredSuggestions = suggestions;

  const viewingDiff = viewingDiffId
    ? suggestions.find((s) => s.id === viewingDiffId)
    : null;

  return (
    <div className="flex flex-col h-full border-l ide-border ide-surface-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b ide-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold ide-text">Suggestions</h2>
          {fileId && filter !== 'history' && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3 py-1.5 text-xs rounded bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'applied', 'history'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setViewingDiffId(null);
                if (f === 'history') {
                  setStatusFilter(undefined);
                } else {
                  setStatusFilter(f === 'all' ? undefined : (f as SuggestionStatus));
                }
              }}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === f
                  ? 'bg-sky-500 text-white'
                  : 'ide-text-muted ide-hover'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Diff preview drawer */}
      {viewingDiff && (
        <div className="border-b ide-border">
          <div className="flex items-center justify-between px-4 py-2 ide-surface-panel">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium ide-text">Diff Preview</span>
              <button
                type="button"
                onClick={() => setUseDiffEditor(!useDiffEditor)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                  useDiffEditor ? 'bg-sky-500 text-white' : 'ide-text-muted hover:ide-text'
                }`}
              >
                {useDiffEditor ? 'Monaco' : 'Simple'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setViewingDiffId(null)}
              className="text-xs ide-text-muted hover:ide-text transition-colors"
            >
              Close
            </button>
          </div>
          <div className="max-h-64 overflow-auto">
            {useDiffEditor ? (
              <div className="p-2">
                <InlineDiffViewer
                  originalContent={viewingDiff.original_code}
                  proposedContent={viewingDiff.suggested_code}
                  fileName={viewingDiff.file_paths[0] ?? 'code'}
                  height={256}
                />
              </div>
            ) : (
              <DiffPreview
                originalCode={viewingDiff.original_code}
                suggestedCode={viewingDiff.suggested_code}
              />
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filter === 'history' ? (
          <SuggestionHistory
            suggestions={suggestions}
            onUndo={handleUndo}
            isUndoing={isUndoing}
          />
        ) : isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredSuggestions.length === 0 ? (
          <div className="text-center py-8 text-sm ide-text-muted">
            <p className="mb-2">No suggestions yet.</p>
            {fileId ? (
              <p className="text-xs">
                Click Generate to analyze your code.
              </p>
            ) : (
              <p className="text-xs">
                Select a file to generate suggestions.
              </p>
            )}
          </div>
        ) : (
          filteredSuggestions.map((suggestion) => (
            <div key={suggestion.id}>
              <SuggestionCard
                suggestion={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
                isApplying={isApplying}
                isRejecting={isRejecting}
              />
              {/* View diff link */}
              {(suggestion.original_code || suggestion.suggested_code) && (
                <button
                  type="button"
                  onClick={() =>
                    setViewingDiffId(
                      viewingDiffId === suggestion.id ? null : suggestion.id
                    )
                  }
                  className="mt-1 px-2 py-0.5 text-[11px] ide-text-muted hover:ide-text transition-colors"
                >
                  {viewingDiffId === suggestion.id ? 'Hide diff' : 'View diff'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
