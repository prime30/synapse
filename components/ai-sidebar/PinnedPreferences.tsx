'use client';

import React, { useState } from 'react';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { usePinnedPreferences } from '@/hooks/usePinnedPreferences';

interface PinnedPreferencesProps {
  projectId: string;
}

interface PinnedPreference {
  id: string;
  rule: string;
  createdAt: string;
}

interface UsePinnedPreferencesReturn {
  pins: PinnedPreference[];
  isLoading: boolean;
  addPin: (rule: string) => Promise<void>;
  removePin: (id: string) => Promise<void>;
}

export function PinnedPreferences({ projectId }: PinnedPreferencesProps) {
  const { pins, isLoading, addPin, removePin } = usePinnedPreferences(projectId) as UsePinnedPreferencesReturn;
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAdd = async () => {
    if (!newRule.trim()) return;
    try {
      await addPin(newRule.trim());
      setNewRule('');
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to add pin:', error);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removePin(id);
    } catch (error) {
      console.error('Failed to remove pin:', error);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return diffMin + 'm ago';
    if (diffHour < 24) return diffHour + 'h ago';
    if (diffDay < 7) return diffDay + 'd ago';
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 ide-text-muted" />
          <h3 className="text-sm font-medium ide-text">Pinned Preferences</h3>
          {!isLoading && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ide-text-muted bg-stone-200/50 dark:bg-[#1e1e1e]">
              {pins.length}
            </span>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <LambdaDots size={14} />
        </div>
      )}

      {/* Pins list */}
      {!isLoading && pins.length > 0 && (
        <div className="space-y-2">
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="rounded-lg ide-surface-inset border ide-border-subtle p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs ide-text leading-relaxed">{pin.rule}</p>
                  <p className="text-[10px] ide-text-muted mt-1">{formatDate(pin.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(pin.id)}
                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded flex-shrink-0"
                  title="Remove pin"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pins.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-xs ide-text-muted">
            No pinned preferences yet. Pin messages in chat to remember corrections.
          </p>
        </div>
      )}

      {/* Add form */}
      {!isLoading && (
        <div className="border-t ide-border-subtle pt-2">
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs ide-text-muted hover:ide-text hover:bg-stone-100/50 dark:hover:bg-white/5 rounded transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add preference</span>
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="Enter a preference or correction rule..."
                className="w-full px-2 py-1.5 text-xs ide-text bg-stone-50 dark:bg-stone-900/50 border ide-border-subtle rounded resize-none focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAdd();
                  }
                  if (e.key === 'Escape') {
                    setIsExpanded(false);
                    setNewRule('');
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newRule.trim() || isAdding}
                  className="px-2 py-1 text-xs font-medium ide-text bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {isAdding ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExpanded(false);
                    setNewRule('');
                  }}
                  className="px-2 py-1 text-xs ide-text-muted hover:ide-text hover:bg-stone-100/50 dark:hover:bg-white/5 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
