'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Preset = 'fast' | 'comfort' | 'power' | 'custom';

export interface EditorSettings {
  // Editor
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  bracketMatching: boolean;
  // Inline completions (ghost text)
  inlineCompletions: boolean;
  // Auto-save
  autoSave: boolean;
  autoSaveDelay: number; // ms
  // Preset
  preset: Preset;
}

/* ------------------------------------------------------------------ */
/*  Presets                                                             */
/* ------------------------------------------------------------------ */

const PRESETS: Record<Exclude<Preset, 'custom'>, Omit<EditorSettings, 'preset'>> = {
  fast: {
    fontSize: 13,
    tabSize: 2,
    wordWrap: false,
    minimap: false,
    lineNumbers: false,
    bracketMatching: true,
    inlineCompletions: true,
    autoSave: true,
    autoSaveDelay: 1000,
  },
  comfort: {
    fontSize: 15,
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
    bracketMatching: true,
    inlineCompletions: true,
    autoSave: true,
    autoSaveDelay: 2000,
  },
  power: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    minimap: true,
    lineNumbers: true,
    bracketMatching: true,
    inlineCompletions: true,
    autoSave: true,
    autoSaveDelay: 2000,
  },
};

export { PRESETS };

const DEFAULT_SETTINGS: EditorSettings = {
  ...PRESETS.comfort,
  preset: 'comfort',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'synapse-editor-settings';

function loadSettings(): EditorSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: EditorSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

/** Check if the current settings match a named preset. */
function detectPreset(settings: EditorSettings): Preset {
  for (const [name, values] of Object.entries(PRESETS) as [Exclude<Preset, 'custom'>, Omit<EditorSettings, 'preset'>][]) {
    const matches = (Object.keys(values) as (keyof typeof values)[]).every(
      (key) => settings[key] === values[key]
    );
    if (matches) return name;
  }
  return 'custom';
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface EditorSettingsContextValue {
  settings: EditorSettings;
  updateSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
  applyPreset: (preset: Exclude<Preset, 'custom'>) => void;
  resetToDefaults: () => void;
}

const EditorSettingsContext = createContext<EditorSettingsContextValue | null>(null);

export function EditorSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EditorSettings>(loadSettings);

  // Persist on every change
  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-detect if we still match a preset
        if (key !== 'preset') {
          next.preset = detectPreset(next);
        }
        return next;
      });
    },
    []
  );

  const applyPreset = useCallback((preset: Exclude<Preset, 'custom'>) => {
    setSettings({ ...PRESETS[preset], preset });
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <EditorSettingsContext.Provider value={{ settings, updateSetting, applyPreset, resetToDefaults }}>
      {children}
    </EditorSettingsContext.Provider>
  );
}

export function useEditorSettings(): EditorSettingsContextValue {
  const ctx = useContext(EditorSettingsContext);
  if (!ctx) {
    throw new Error('useEditorSettings must be used within an EditorSettingsProvider');
  }
  return ctx;
}
