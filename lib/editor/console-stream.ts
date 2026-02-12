export type ConsoleTab = 'diagnostics' | 'push-log' | 'theme-check';

export interface ConsoleEntry {
  id: string;
  tab: ConsoleTab;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: number;
  details?: string;
}

export type ConsoleListener = (entry: ConsoleEntry) => void;

class ConsoleStream {
  private listeners: Set<ConsoleListener> = new Set();
  private entries: ConsoleEntry[] = [];
  private maxEntries = 500;

  subscribe(listener: ConsoleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(tab: ConsoleTab, level: ConsoleEntry['level'], message: string, details?: string): void {
    const entry: ConsoleEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tab,
      level,
      message,
      timestamp: Date.now(),
      details,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this.listeners.forEach(fn => fn(entry));
  }

  getEntries(tab?: ConsoleTab): ConsoleEntry[] {
    if (!tab) return [...this.entries];
    return this.entries.filter(e => e.tab === tab);
  }

  clear(tab?: ConsoleTab): void {
    if (!tab) {
      this.entries = [];
      return;
    }
    this.entries = this.entries.filter(e => e.tab !== tab);
  }
}

export const consoleStream = new ConsoleStream();
