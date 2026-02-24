'use client';

import { useState, useCallback } from 'react';

export interface ToolProgressState {
  toolCallId: string;
  name: string;
  phase: string;
  detail: string;
  bytesProcessed?: number;
  totalBytes?: number;
  matchCount?: number;
  lineNumber?: number;
  percentage?: number;
  contentPreview?: string;
  matches?: Array<{ file: string; line: number }>;
}

export function useToolProgress() {
  const [activeTools, setActiveTools] = useState<Map<string, ToolProgressState>>(new Map());

  const handleToolProgress = useCallback(
    (event: {
      toolCallId: string;
      name: string;
      progress: {
        phase: string;
        detail: string;
        bytesProcessed?: number;
        totalBytes?: number;
        matchCount?: number;
        lineNumber?: number;
        percentage?: number;
      };
    }) => {
      setActiveTools(prev => {
        const next = new Map(prev);
        const existing = next.get(event.toolCallId);
        const detail = event.progress.detail ?? '';
        const isGrepMatch = event.name === 'grep_content' && detail.includes(':');
        const newMatch = isGrepMatch
          ? {
              file: detail.split(':')[0] ?? '',
              line: parseInt(detail.split(':')[1] ?? '0', 10) || 0,
            }
          : null;

        next.set(event.toolCallId, {
          ...existing,
          toolCallId: event.toolCallId,
          name: event.name,
          phase: event.progress.phase,
          detail,
          bytesProcessed: event.progress.bytesProcessed,
          totalBytes: event.progress.totalBytes,
          matchCount: event.progress.matchCount,
          lineNumber: event.progress.lineNumber,
          percentage: event.progress.percentage,
          matches:
            newMatch && existing?.matches
              ? [...existing.matches, newMatch]
              : newMatch
                ? [newMatch]
                : existing?.matches,
        });
        return next;
      });
    },
    [],
  );

  const handleToolComplete = useCallback((toolCallId: string) => {
    setActiveTools(prev => {
      const next = new Map(prev);
      next.delete(toolCallId);
      return next;
    });
  }, []);

  return { activeTools, handleToolProgress, handleToolComplete };
}
