'use client';

import { useState, useEffect, useCallback } from 'react';
import { consoleStream, type ConsoleTab, type ConsoleEntry } from '@/lib/editor/console-stream';

export function useThemeConsole() {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('diagnostics');
  const [entries, setEntries] = useState<ConsoleEntry[]>(() => consoleStream.getEntries());
  const [isOpen, setIsOpen] = useState(false);

  // Subscribe to new entries
  useEffect(() => {
    const unsubscribe = consoleStream.subscribe((entry) => {
      setEntries((prev) => [...prev, entry]);
    });
    return unsubscribe;
  }, []);

  const filteredEntries = entries.filter((e) => e.tab === activeTab);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const clearTab = useCallback(() => {
    consoleStream.clear(activeTab);
    setEntries(consoleStream.getEntries());
  }, [activeTab]);
  const clearAll = useCallback(() => {
    consoleStream.clear();
    setEntries([]);
  }, []);

  return {
    isOpen,
    toggle,
    setIsOpen,
    activeTab,
    setActiveTab,
    entries: filteredEntries,
    allEntries: entries,
    clearTab,
    clearAll,
    counts: {
      diagnostics: entries.filter((e) => e.tab === 'diagnostics').length,
      'push-log': entries.filter((e) => e.tab === 'push-log').length,
      'theme-check': entries.filter((e) => e.tab === 'theme-check').length,
    },
  };
}
