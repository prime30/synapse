'use client';

import { useState, useCallback, useMemo } from 'react';
import type {
  MemoryEntry,
  MemoryType,
  MemoryFeedback,
  Convention,
  Decision,
  Preference,
} from '@/lib/ai/developer-memory';

// ── Types ─────────────────────────────────────────────────────────────

interface MemoryPanelProps {
  memories: MemoryEntry[];
  isLoading: boolean;
  onFeedback: (id: string, feedback: MemoryFeedback) => void;
  onForget: (id: string) => void;
  onEdit: (id: string, content: MemoryEntry['content']) => void;
  /** Convention count for the status bar indicator */
  activeConventionCount?: number;
}

type TabId = 'conventions' | 'decisions' | 'preferences';

// ── Confidence badge ──────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80
      ? 'text-green-400 bg-green-400/10'
      : pct >= 60
        ? 'text-yellow-400 bg-yellow-400/10'
        : 'ide-text-muted bg-stone-200/50 dark:bg-white/10';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}
      title={`${pct}% confidence`}
    >
      {pct}%
    </span>
  );
}

// ── Feedback buttons ──────────────────────────────────────────────────

function FeedbackButtons({
  currentFeedback,
  onFeedback,
}: {
  currentFeedback: MemoryFeedback;
  onFeedback: (feedback: MemoryFeedback) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onFeedback(currentFeedback === 'correct' ? null : 'correct')}
        className={`p-1 rounded transition-colors ${
          currentFeedback === 'correct'
            ? 'text-green-400 bg-green-400/20'
            : 'ide-text-muted hover:text-green-400 hover:bg-green-400/10'
        }`}
        title="Mark as correct"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onFeedback(currentFeedback === 'wrong' ? null : 'wrong')}
        className={`p-1 rounded transition-colors ${
          currentFeedback === 'wrong'
            ? 'text-red-400 bg-red-400/20'
            : 'ide-text-muted hover:text-red-400 hover:bg-red-400/10'
        }`}
        title="Mark as wrong"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── Convention item ───────────────────────────────────────────────────

function ConventionItem({
  entry,
  onFeedback,
  onForget,
}: {
  entry: MemoryEntry;
  onFeedback: (id: string, feedback: MemoryFeedback) => void;
  onForget: (id: string) => void;
}) {
  const convention = entry.content as Convention;

  return (
    <div className="px-3 py-2.5 border-b ide-border last:border-b-0 ide-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm ide-text font-medium truncate">
              {convention.pattern}
            </span>
            <ConfidenceBadge confidence={entry.confidence} />
          </div>
          <div className="text-[11px] ide-text-muted mb-1">
            Source: {convention.source}
          </div>
          {convention.examples.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {convention.examples.slice(0, 3).map((example, i) => (
                <code
                  key={i}
                  className="px-1.5 py-0.5 ide-surface-inset rounded text-[10px] ide-text-muted font-mono"
                >
                  {example.length > 30 ? example.slice(0, 30) + '...' : example}
                </code>
              ))}
              {convention.examples.length > 3 && (
                <span className="text-[10px] ide-text-quiet">
                  +{convention.examples.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <FeedbackButtons
            currentFeedback={entry.feedback}
            onFeedback={(fb) => onFeedback(entry.id, fb)}
          />
          <button
            type="button"
            onClick={() => onForget(entry.id)}
            className="p-1 rounded ide-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Forget this convention"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Decision item ─────────────────────────────────────────────────────

function DecisionItem({
  entry,
  onFeedback,
  onForget,
}: {
  entry: MemoryEntry;
  onFeedback: (id: string, feedback: MemoryFeedback) => void;
  onForget: (id: string) => void;
}) {
  const decision = entry.content as Decision;

  return (
    <div className="px-3 py-2.5 border-b ide-border last:border-b-0 ide-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm ide-text font-medium">
              {decision.choice}
            </span>
            <ConfidenceBadge confidence={entry.confidence} />
          </div>
          <div className="text-[11px] ide-text-muted mb-1">
            {decision.reasoning}
          </div>
          <div className="text-[10px] ide-text-quiet">
            {new Date(decision.timestamp).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {decision.context && (
              <span className="ml-2 ide-text-quiet" title={decision.context}>
                — {decision.context.slice(0, 60)}
                {decision.context.length > 60 ? '...' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <FeedbackButtons
            currentFeedback={entry.feedback}
            onFeedback={(fb) => onFeedback(entry.id, fb)}
          />
          <button
            type="button"
            onClick={() => onForget(entry.id)}
            className="p-1 rounded ide-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Forget this decision"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preference item ───────────────────────────────────────────────────

function PreferenceItem({
  entry,
  onFeedback,
  onForget,
}: {
  entry: MemoryEntry;
  onFeedback: (id: string, feedback: MemoryFeedback) => void;
  onForget: (id: string) => void;
}) {
  const preference = entry.content as Preference;

  return (
    <div className="px-3 py-2.5 border-b ide-border last:border-b-0 ide-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm ide-text font-medium">
              {preference.preference}
            </span>
            <ConfidenceBadge confidence={entry.confidence} />
          </div>
          {preference.antiPattern && (
            <div className="text-[11px] text-red-400/70 mb-1">
              Avoids: {preference.antiPattern}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] ide-text-quiet">
            <span className="px-1.5 py-0.5 ide-surface-inset rounded">
              {preference.category}
            </span>
            <span>{preference.observationCount} observations</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <FeedbackButtons
            currentFeedback={entry.feedback}
            onFeedback={(fb) => onFeedback(entry.id, fb)}
          />
          <button
            type="button"
            onClick={() => onForget(entry.id)}
            className="p-1 rounded ide-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Forget this preference"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabId }) {
  const messages: Record<TabId, { icon: string; title: string; description: string }> = {
    conventions: {
      icon: '📐',
      title: 'No conventions detected',
      description: 'As you work on your theme, Synapse will detect naming patterns, schema conventions, and coding styles.',
    },
    decisions: {
      icon: '🧭',
      title: 'No decisions recorded',
      description: 'Explicit choices made during AI conversations (like "Let\'s use BEM" or "I chose flexbox because...") will appear here.',
    },
    preferences: {
      icon: '🎯',
      title: 'No preferences learned',
      description: 'As you accept, reject, and edit AI suggestions, Synapse will learn your preferred coding patterns.',
    },
  };

  const msg = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <span className="text-2xl mb-2">{msg.icon}</span>
      <div className="text-sm ide-text-muted font-medium mb-1">{msg.title}</div>
      <div className="text-[11px] ide-text-quiet max-w-[240px]">{msg.description}</div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="h-4 ide-surface-inset rounded w-48" />
        <div className="h-3 ide-surface-inset rounded w-32" />
        <div className="flex gap-1">
          <div className="h-4 ide-surface-inset rounded w-16" />
          <div className="h-4 ide-surface-inset rounded w-20" />
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <div className="w-6 h-6 ide-surface-inset rounded" />
        <div className="w-6 h-6 ide-surface-inset rounded" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; type: MemoryType }> = [
  { id: 'conventions', label: 'Conventions', type: 'convention' },
  { id: 'decisions', label: 'Decisions', type: 'decision' },
  { id: 'preferences', label: 'Preferences', type: 'preference' },
];

export function MemoryPanel({
  memories,
  isLoading,
  onFeedback,
  onForget,
  onEdit: _onEdit,
}: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('conventions');

  const filteredMemories = useMemo(() => {
    const targetType = TABS.find((t) => t.id === activeTab)?.type;
    return memories.filter((m) => m.type === targetType);
  }, [memories, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = {
      conventions: 0,
      decisions: 0,
      preferences: 0,
    };
    for (const m of memories) {
      if (m.type === 'convention') counts.conventions++;
      else if (m.type === 'decision') counts.decisions++;
      else if (m.type === 'preference') counts.preferences++;
    }
    return counts;
  }, [memories]);

  const handleFeedback = useCallback(
    (id: string, feedback: MemoryFeedback) => {
      onFeedback(id, feedback);
    },
    [onFeedback]
  );

  const handleForget = useCallback(
    (id: string) => {
      onForget(id);
    },
    [onForget]
  );

  return (
    <div className="border ide-border rounded-lg ide-surface-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b ide-border">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-purple-400 shrink-0"
        >
          <path d="M12 2a9 9 0 0 1 9 9c0 3.9-3.2 7.2-6.4 9.8a2.1 2.1 0 0 1-2.6 0h0A23.3 23.3 0 0 1 3 11a9 9 0 0 1 9-9Z" />
          <path d="M12 2a7 7 0 0 0-4.9 2" />
          <path d="M12 2a7 7 0 0 1 4.9 2" />
          <circle cx="12" cy="11" r="3" />
        </svg>
        <span className="text-sm font-medium ide-text">Developer Memory</span>
        <span className="text-[10px] ide-text-quiet ml-auto">
          {memories.length} {memories.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b ide-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-purple-400'
                : 'ide-text-muted hover:ide-text ide-hover'
            }`}
          >
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span className="ml-1 text-[10px] ide-text-quiet">
                ({tabCounts[tab.id]})
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-400" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto max-h-[400px]">
        {isLoading ? (
          <div className="space-y-0">
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </div>
        ) : filteredMemories.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div>
            {filteredMemories.map((entry) => {
              switch (entry.type) {
                case 'convention':
                  return (
                    <ConventionItem
                      key={entry.id}
                      entry={entry}
                      onFeedback={handleFeedback}
                      onForget={handleForget}
                    />
                  );
                case 'decision':
                  return (
                    <DecisionItem
                      key={entry.id}
                      entry={entry}
                      onFeedback={handleFeedback}
                      onForget={handleForget}
                    />
                  );
                case 'preference':
                  return (
                    <PreferenceItem
                      key={entry.id}
                      entry={entry}
                      onFeedback={handleFeedback}
                      onForget={handleForget}
                    />
                  );
                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
