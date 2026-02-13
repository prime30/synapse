'use client';

import React, { useMemo } from 'react';
import { MessageSquare, CheckCircle } from 'lucide-react';
import type { CodeComment } from '@/hooks/useCodeComments';

// ── Types ────────────────────────────────────────────────────────────────────

interface LineCommentGroup {
  line: number;
  count: number;
  resolved: boolean; // true only if ALL top-level comments on this line are resolved
}

interface InlineCommentsProps {
  comments: CodeComment[];
  onLineClick: (line: number) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InlineComments({ comments, onLineClick }: InlineCommentsProps) {
  const lineGroups = useMemo<LineCommentGroup[]>(() => {
    const map = new Map<number, { count: number; allResolved: boolean }>();

    for (const comment of comments) {
      const existing = map.get(comment.line_number);
      const replyCount = comment.replies?.length ?? 0;
      if (existing) {
        existing.count += 1 + replyCount;
        if (!comment.resolved) existing.allResolved = false;
      } else {
        map.set(comment.line_number, {
          count: 1 + replyCount,
          allResolved: comment.resolved,
        });
      }
    }

    return Array.from(map.entries())
      .map(([line, { count, allResolved }]) => ({
        line,
        count,
        resolved: allResolved,
      }))
      .sort((a, b) => a.line - b.line);
  }, [comments]);

  if (lineGroups.length === 0) return null;

  return (
    <div className="absolute right-0 top-0 z-10 flex flex-col gap-0.5 pointer-events-auto">
      {lineGroups.map((group) => (
        <button
          key={group.line}
          type="button"
          onClick={() => onLineClick(group.line)}
          title={`${group.count} comment${group.count > 1 ? 's' : ''} on line ${group.line}${group.resolved ? ' (resolved)' : ''}`}
          className={`
            flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
            transition-colors duration-150 cursor-pointer
            ${
              group.resolved
                ? 'ide-text-muted hover:ide-text-2 ide-surface-input'
                : 'text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 ide-surface-panel'
            }
          `}
        >
          {group.resolved ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5" />
          )}
          {group.count > 1 && (
            <span className="font-mono leading-none">{group.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
