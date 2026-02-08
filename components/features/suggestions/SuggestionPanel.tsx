'use client';

import { useState } from 'react';
import { useSuggestions } from '@/hooks/useSuggestions';
import { SuggestionCard } from './SuggestionCard';
import type { SuggestionStatus } from '@/lib/types/suggestion';

interface SuggestionPanelProps {
  projectId: string;
  fileId?: string;
  onGenerate?: () => void;
}

type FilterStatus = 'all' | 'pending' | 'applied';

function SkeletonCard() {
  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-16 h-5 bg-gray-700 rounded" />
        <div className="w-20 h-4 bg-gray-700 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-700 rounded w-3/4" />
      </div>
      <div className="flex gap-2 pt-2 border-t border-gray-700">
        <div className="flex-1 h-8 bg-gray-700 rounded" />
        <div className="flex-1 h-8 bg-gray-700 rounded" />
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

  const {
    suggestions,
    isLoading,
    generate,
    apply,
    reject,
    refetch,
    isGenerating,
    isApplying,
    isRejecting,
  } = useSuggestions({
    projectId,
    fileId,
    status: statusFilter,
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

  // When filter is 'all', statusFilter is undefined so API returns all suggestions
  // When filter is 'pending' or 'applied', statusFilter matches filter so API already filtered
  const filteredSuggestions = suggestions;

  return (
    <div className="flex flex-col h-full border-l border-gray-700 bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200">Suggestions</h2>
          {fileId && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'applied'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setStatusFilter(f === 'all' ? undefined : (f as SuggestionStatus));
              }}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredSuggestions.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
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
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={handleAccept}
              onReject={handleReject}
              isApplying={isApplying}
              isRejecting={isRejecting}
            />
          ))
        )}
      </div>
    </div>
  );
}
