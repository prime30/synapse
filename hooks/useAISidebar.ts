'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'synapse-ai-sidebar';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 300;
const MAX_WIDTH = 800;

interface StoredState {
  isOpen: boolean;
  width: number;
}

function loadState(): StoredState {
  if (typeof window === 'undefined')
    return { isOpen: false, width: DEFAULT_WIDTH };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isOpen: false, width: DEFAULT_WIDTH };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      isOpen: Boolean(parsed.isOpen),
      width:
        typeof parsed.width === 'number' &&
        parsed.width >= MIN_WIDTH &&
        parsed.width <= MAX_WIDTH
          ? parsed.width
          : DEFAULT_WIDTH,
    };
  } catch {
    return { isOpen: false, width: DEFAULT_WIDTH };
  }
}

function saveState(state: StoredState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface AISidebarContextValue {
  /** Current file path for context panel */
  filePath: string | null;
  /** Language/mode of current file */
  fileLanguage: string | null;
  /** Current selection text */
  selection: string | null;
}

export function useAISidebar(initialContext?: AISidebarContextValue) {
  const [isOpen, setIsOpenState] = useState(() => loadState().isOpen);
  const [width, setWidthState] = useState(() => loadState().width);
  const [context, setContext] = useState<AISidebarContextValue>({
    filePath: initialContext?.filePath ?? null,
    fileLanguage: initialContext?.fileLanguage ?? null,
    selection: initialContext?.selection ?? null,
  });

  // Persist when isOpen or width changes
  useEffect(() => {
    saveState({ isOpen, width });
  }, [isOpen, width]);

  const toggle = useCallback(() => {
    setIsOpenState((prev) => !prev);
  }, []);

  const open = useCallback(() => setIsOpenState(true), []);
  const close = useCallback(() => setIsOpenState(false), []);

  const setWidth = useCallback((w: number) => {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
    setWidthState(next);
  }, []);

  const updateContext = useCallback((next: Partial<AISidebarContextValue>) => {
    setContext((prev) => ({ ...prev, ...next }));
  }, []);

  // Cmd/Ctrl+Shift+A to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  return {
    isOpen,
    width,
    setWidth,
    toggle,
    open,
    close,
    context,
    updateContext,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
  };
}
