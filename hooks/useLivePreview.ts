'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Phase 4a: Live preview hot-reload during agent execution.
 * Tracks tentative changes applied to the preview iframe during streaming.
 */

export interface LiveChange {
  filePath: string;
  css?: string;
  newContent: string;
  appliedAt: number;
}

export interface LivePreviewState {
  isStreaming: boolean;
  changeCount: number;
  changes: LiveChange[];
}

export interface LivePreviewActions {
  startSession: () => void;
  pushChange: (change: LiveChange) => void;
  endSession: () => void;
  clearChanges: () => void;
  getAggregatedCSS: () => string;
}

function extractCSS(filePath: string, content: string): string | undefined {
  if (filePath.endsWith('.css') || filePath.endsWith('.scss')) {
    return content;
  }
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches: string[] = [];
  let match = styleRegex.exec(content);
  while (match) {
    matches.push(match[1]);
    match = styleRegex.exec(content);
  }
  return matches.length > 0 ? matches.join('\n') : undefined;
}

export function useLivePreview(): [LivePreviewState, LivePreviewActions] {
  const [isStreaming, setIsStreaming] = useState(false);
  const [changes, setChanges] = useState<LiveChange[]>([]);
  const changesRef = useRef<LiveChange[]>([]);

  const startSession = useCallback(() => {
    setIsStreaming(true);
    setChanges([]);
    changesRef.current = [];
  }, []);

  const pushChange = useCallback((change: LiveChange) => {
    const css = extractCSS(change.filePath, change.newContent);
    const enriched: LiveChange = { ...change, css: css, appliedAt: Date.now() };
    changesRef.current = [...changesRef.current, enriched];
    setChanges(changesRef.current);
  }, []);

  const endSession = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const clearChanges = useCallback(() => {
    setChanges([]);
    changesRef.current = [];
  }, []);

  const getAggregatedCSS = useCallback(() => {
    return changesRef.current
      .filter(function(c) { return c.css; })
      .map(function(c) { return '/* ' + c.filePath + ' */\n' + c.css; })
      .join('\n\n');
  }, []);

  return [
    { isStreaming: isStreaming, changeCount: changes.length, changes: changes },
    { startSession: startSession, pushChange: pushChange, endSession: endSession, clearChanges: clearChanges, getAggregatedCSS: getAggregatedCSS },
  ];
}
