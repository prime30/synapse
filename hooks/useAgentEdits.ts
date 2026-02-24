'use client';

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from 'react';

export interface AgentEdit {
  startLine: number;
  endLine: number;
  reasoning: string;
  agentType: string;
  timestamp: number;
}

type Listener = () => void;

class AgentEditStore {
  private edits = new Map<string, AgentEdit[]>();
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.edits;

  private notify() {
    this.edits = new Map(this.edits);
    for (const l of this.listeners) l();
  }

  addEdits(filePath: string, newEdits: AgentEdit[]) {
    const existing = this.edits.get(filePath) ?? [];
    this.edits.set(filePath, [...existing, ...newEdits]);
    this.notify();
  }

  getEdits(filePath: string): AgentEdit[] {
    return this.edits.get(filePath) ?? [];
  }

  hasEdits(filePath: string): boolean {
    return (this.edits.get(filePath)?.length ?? 0) > 0;
  }

  clearEdits(filePath: string) {
    if (this.edits.has(filePath)) {
      this.edits.delete(filePath);
      this.notify();
    }
  }

  allEditedPaths(): string[] {
    return Array.from(this.edits.keys()).filter((k) => (this.edits.get(k)?.length ?? 0) > 0);
  }
}

const store = new AgentEditStore();

export const AgentEditContext = createContext(store);

export function useAgentEdits() {
  const s = useContext(AgentEditContext);
  const snapshot = useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);

  const addEdits = useCallback(
    (filePath: string, edits: AgentEdit[]) => s.addEdits(filePath, edits),
    [s],
  );
  const getEdits = useCallback((filePath: string) => snapshot.get(filePath) ?? [], [snapshot]);
  const hasEdits = useCallback((filePath: string) => (snapshot.get(filePath)?.length ?? 0) > 0, [snapshot]);
  const clearEdits = useCallback((filePath: string) => s.clearEdits(filePath), [s]);
  const allEditedPaths = useCallback(
    () => Array.from(snapshot.keys()).filter((k) => (snapshot.get(k)?.length ?? 0) > 0),
    [snapshot],
  );

  return { addEdits, getEdits, hasEdits, clearEdits, allEditedPaths };
}
