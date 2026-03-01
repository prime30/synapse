'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export type FileCategory = 'liquid' | 'css' | 'js' | 'json';

export interface PaneEntry {
  fileCategory: FileCategory;
  filePath: string;
  content: string;
  originalContent: string;
  updatedAt: number;
}

export interface UseAgentCodePanesReturn {
  panes: Map<FileCategory, PaneEntry>;
  visible: boolean;
  updatePane: (filePath: string, content: string, originalContent: string) => void;
  dismissAll: () => void;
  dismissPane: (category: FileCategory) => void;
  reset: () => void;
}

const EXT_MAP: Record<string, FileCategory> = {
  '.liquid': 'liquid',
  '.css': 'css',
  '.scss': 'css',
  '.js': 'js',
  '.ts': 'js',
  '.json': 'json',
};

function categorizeFile(filePath: string): FileCategory | null {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return null;
  return EXT_MAP[filePath.slice(dot).toLowerCase()] ?? null;
}

export function useAgentCodePanes(): UseAgentCodePanesReturn {
  const [panes, setPanes] = useState<Map<FileCategory, PaneEntry>>(new Map());
  const [visible, setVisible] = useState(false);
  const panesRef = useRef(panes);
  useEffect(() => { panesRef.current = panes; }, [panes]);

  const updatePane = useCallback(
    (filePath: string, content: string, originalContent: string) => {
      const category = categorizeFile(filePath);
      if (!category) return;

      const next = new Map(panesRef.current);
      next.set(category, {
        fileCategory: category,
        filePath,
        content,
        originalContent,
        updatedAt: Date.now(),
      });
      setPanes(next);
      setVisible(true);
    },
    [],
  );

  const dismissAll = useCallback(() => {
    setPanes(new Map());
    setVisible(false);
  }, []);

  const dismissPane = useCallback((category: FileCategory) => {
    const next = new Map(panesRef.current);
    next.delete(category);
    setPanes(next);
    if (next.size === 0) setVisible(false);
  }, []);

  const reset = useCallback(() => {
    setPanes(new Map());
    setVisible(false);
  }, []);

  return { panes, visible, updatePane, dismissAll, dismissPane, reset };
}
