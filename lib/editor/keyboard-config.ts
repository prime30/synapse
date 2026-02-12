/**
 * Central keyboard shortcut configuration for the Synapse IDE.
 * Pure TypeScript utility – no React or external dependencies.
 */

const STORAGE_KEY = 'synapse-keybindings';

export interface KeyBinding {
  id: string;
  label: string;
  description: string;
  /** Default key combo string like "Ctrl+D", "Ctrl+Shift+P", "Ctrl+`" */
  defaultKeys: string;
  /** User-customized keys (null = use default) */
  customKeys: string | null;
  /** Category for grouping in UI */
  category: 'editor' | 'navigation' | 'ai' | 'general';
}

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  {
    id: 'selectNextOccurrence',
    label: 'Select Next Occurrence',
    description: 'Add next occurrence of current selection to multi-cursor',
    defaultKeys: 'Ctrl+D',
    customKeys: null,
    category: 'editor',
  },
  {
    id: 'commandPalette',
    label: 'Command Palette',
    description: 'Open command palette',
    defaultKeys: 'Ctrl+Shift+P',
    customKeys: null,
    category: 'navigation',
  },
  {
    id: 'toggleConsole',
    label: 'Toggle Theme Console',
    description: 'Toggle theme console panel',
    defaultKeys: 'Ctrl+`',
    customKeys: null,
    category: 'general',
  },
  {
    id: 'formatDocument',
    label: 'Format Document',
    description: 'Format the current document',
    defaultKeys: 'Shift+Alt+F',
    customKeys: null,
    category: 'editor',
  },
  {
    id: 'save',
    label: 'Save File',
    description: 'Save the current file',
    defaultKeys: 'Ctrl+S',
    customKeys: null,
    category: 'general',
  },
  {
    id: 'findReferences',
    label: 'Find All References',
    description: 'Find all references to the symbol at cursor',
    defaultKeys: 'Shift+F12',
    customKeys: null,
    category: 'editor',
  },
  {
    id: 'goToDefinition',
    label: 'Go to Definition',
    description: 'Go to definition (handled by Monaco on Ctrl+Click)',
    defaultKeys: 'Ctrl+Click',
    customKeys: null,
    category: 'navigation',
  },
  {
    id: 'toggleAIChat',
    label: 'Toggle AI Chat',
    description: 'Toggle AI chat panel',
    defaultKeys: 'Ctrl+L',
    customKeys: null,
    category: 'ai',
  },
  {
    id: 'quickActions',
    label: 'Quick Actions',
    description: 'Open quick actions menu',
    defaultKeys: 'Ctrl+.',
    customKeys: null,
    category: 'editor',
  },
];

/**
 * Load keybindings from localStorage, merging with defaults.
 * Ensures all default bindings are present; applies saved customizations where ids match.
 */
export function loadKeybindings(): KeyBinding[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [...DEFAULT_KEYBINDINGS];

    const saved = JSON.parse(raw) as KeyBinding[];
    if (!Array.isArray(saved)) return [...DEFAULT_KEYBINDINGS];

    const byId = new Map<string, KeyBinding>();
    for (const b of saved) {
      if (b && typeof b.id === 'string') byId.set(b.id, b);
    }

    return DEFAULT_KEYBINDINGS.map((def) => {
      const s = byId.get(def.id);
      if (!s) return { ...def };
      return {
        ...def,
        customKeys: s.customKeys ?? def.customKeys,
      };
    });
  } catch {
    return [...DEFAULT_KEYBINDINGS];
  }
}

/**
 * Save keybindings to localStorage.
 */
export function saveKeybindings(bindings: KeyBinding[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // localStorage may be full or disabled
  }
}

/**
 * Reset keybindings to defaults and clear localStorage.
 * Returns the default bindings.
 */
export function resetKeybindings(): KeyBinding[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return [...DEFAULT_KEYBINDINGS];
}

/**
 * Get the effective key combination for a binding (custom if set, otherwise default).
 */
export function getEffectiveKey(binding: KeyBinding): string {
  return binding.customKeys ?? binding.defaultKeys;
}
