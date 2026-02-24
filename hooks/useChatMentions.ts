'use client';

import { useState, useEffect, useMemo, useCallback, RefObject } from 'react';
import type { PlanMention } from '@/components/ai-sidebar/PlanMentionPopover';

export interface MentionState {
  visible: boolean;
  query: string;
  selectedIndex: number;
  anchorRect: { top: number; left: number } | null;
  triggerIndex: number;
}

export interface UseChatMentionsOptions {
  /** Project ID for fetching plans */
  projectId?: string;
  /** Called when draft text changes (e.g. after selecting a mention) */
  onDraftChange?: (draft: string) => void;
}

export interface UseChatMentionsReturn {
  /** Current @ mention query (text after @) */
  mentionQuery: string;
  /** Whether the mention popover should be visible */
  showMentionPopover: boolean;
  /** Filtered plans matching the query */
  mentions: PlanMention[];
  /** Currently selected index in the list */
  selectedIndex: number;
  /** Anchor rect for popover positioning */
  anchorRect: { top: number; left: number } | undefined;
  /** Select a mention (insert into input and close) */
  selectMention: (plan: PlanMention) => void;
  /** Close the mention popover */
  closeMentionPopover: () => void;
  /** Update mention state from input change (call from textarea onChange) */
  handleInputChange: (draft: string, cursorPos: number, inputRect?: DOMRect) => void;
  /** Handle keydown for arrow/enter/escape (call from textarea onKeyDown) */
  handleKeyDown: (
    e: React.KeyboardEvent,
    options: { filteredCount: number }
  ) => boolean;
}

/**
 * Manages @plan typeahead/mention state for chat input: fetches plans,
 * tracks @ trigger position, filters suggestions, and handles selection.
 */
export function useChatMentions(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  options?: UseChatMentionsOptions
): UseChatMentionsReturn {
  const { projectId, onDraftChange } = options ?? {};
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [projectPlans, setProjectPlans] = useState<PlanMention[]>([]);

  // Fetch project plans for @plan typeahead
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/plans`)
      .then((r) => r.json())
      .then((data) => {
        setProjectPlans(
          (data.data?.plans ?? []).map((p: { id: string; name: string; todoProgress?: { completed: number; total: number } }) => ({
            id: p.id,
            name: p.name,
            todoProgress: p.todoProgress ?? { completed: 0, total: 0 },
          }))
        );
      })
      .catch(() => {});
  }, [projectId]);

  const filteredPlans = useMemo(() => {
    if (!mentionState) return [];
    return projectPlans.filter((p) =>
      p.name.toLowerCase().includes(mentionState.query.toLowerCase())
    );
  }, [projectPlans, mentionState]);

  const selectMention = useCallback(
    (plan: PlanMention) => {
      const textarea = inputRef.current;
      if (!textarea || !mentionState) return;
      const val = textarea.value;
      const before = val.slice(0, mentionState.triggerIndex);
      const after = val.slice(textarea.selectionStart ?? val.length);
      const mention = `@plan:${plan.name} `;
      textarea.value = before + mention + after;
      onDraftChange?.(textarea.value);
      setMentionState(null);
      textarea.focus();
      const newPos = before.length + mention.length;
      textarea.setSelectionRange(newPos, newPos);
    },
    [inputRef, mentionState, onDraftChange]
  );

  const closeMentionPopover = useCallback(() => {
    setMentionState(null);
  }, []);

  const handleInputChange = useCallback(
    (draft: string, cursorPos: number, inputRect?: DOMRect) => {
      const lastAt = draft.lastIndexOf('@', cursorPos - 1);
      if (
        lastAt >= 0 &&
        (lastAt === 0 || draft[lastAt - 1] === ' ' || draft[lastAt - 1] === '\n')
      ) {
        const query = draft.slice(lastAt + 1, cursorPos);
        if (!query.includes(' ') && !query.includes('\n')) {
          const rect = inputRect ?? inputRef.current?.getBoundingClientRect();
          setMentionState({
            visible: true,
            query,
            selectedIndex: 0,
            anchorRect: rect
              ? { top: rect.top - 8, left: rect.left + 16 }
              : null,
            triggerIndex: lastAt,
          });
        } else {
          setMentionState(null);
        }
      } else {
        setMentionState(null);
      }
    },
    [inputRef]
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      options: { filteredCount: number }
    ): boolean => {
      const { filteredCount } = options;
      if (!mentionState?.visible) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex: Math.min(
                  prev.selectedIndex + 1,
                  filteredCount - 1
                ),
              }
            : null
        );
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState((prev) =>
          prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null
        );
        return true;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredPlans[mentionState.selectedIndex];
        if (selected) selectMention(selected);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionPopover();
        return true;
      }
      return false;
    },
    [mentionState, filteredPlans, selectMention, closeMentionPopover]
  );

  return {
    mentionQuery: mentionState?.query ?? '',
    showMentionPopover: mentionState?.visible ?? false,
    mentions: filteredPlans,
    selectedIndex: mentionState?.selectedIndex ?? 0,
    anchorRect: mentionState?.anchorRect ?? undefined,
    selectMention,
    closeMentionPopover,
    handleInputChange,
    handleKeyDown,
  };
}
