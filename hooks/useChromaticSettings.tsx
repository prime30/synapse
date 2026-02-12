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

/** Per-region toggle for chromatic theming. */
export interface ChromaticRegionSettings {
  sidebar: boolean;
  editor: boolean;
  preview: boolean;
  statusBar: boolean;
  activityBar: boolean;
}

/** Top-level chromatic theming settings. */
export interface ChromaticSettings {
  enabled: boolean;
  intensity: number; // 0-100
  regions: ChromaticRegionSettings;
  transitionDuration: number; // ms
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_CHROMATIC_SETTINGS: ChromaticSettings = {
  enabled: true,
  intensity: 40,
  regions: {
    sidebar: true,
    editor: true,
    preview: false,
    statusBar: true,
    activityBar: true,
  },
  transitionDuration: 1200,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'synapse-chromatic-settings';

function loadSettings(): ChromaticSettings {
  if (typeof window === 'undefined') return DEFAULT_CHROMATIC_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHROMATIC_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChromaticSettings>;
    return { ...DEFAULT_CHROMATIC_SETTINGS, ...parsed, regions: { ...DEFAULT_CHROMATIC_SETTINGS.regions, ...(parsed.regions ?? {}) } };
  } catch {
    return DEFAULT_CHROMATIC_SETTINGS;
  }
}

function persistSettings(settings: ChromaticSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

/** Clamp a number between 0 and 100. */
function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface ChromaticSettingsContextValue {
  settings: ChromaticSettings;
  updateSetting: <K extends keyof ChromaticSettings>(key: K, value: ChromaticSettings[K]) => void;
  updateRegion: (region: keyof ChromaticRegionSettings, value: boolean) => void;
  resetToDefaults: () => void;
  setIntensity: (intensity: number) => void;
  toggleEnabled: () => void;
}

const ChromaticSettingsContext = createContext<ChromaticSettingsContextValue | null>(null);

/** Provider that manages chromatic IDE theming settings with localStorage persistence. */
export function ChromaticSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ChromaticSettings>(loadSettings);

  // Persist on every change
  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof ChromaticSettings>(key: K, value: ChromaticSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: key === 'intensity' ? clampIntensity(value as number) : value }));
    },
    []
  );

  const updateRegion = useCallback((region: keyof ChromaticRegionSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, regions: { ...prev.regions, [region]: value } }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_CHROMATIC_SETTINGS);
  }, []);

  const setIntensity = useCallback((intensity: number) => {
    setSettings((prev) => ({ ...prev, intensity: clampIntensity(intensity) }));
  }, []);

  const toggleEnabled = useCallback(() => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  return (
    <ChromaticSettingsContext.Provider
      value={{ settings, updateSetting, updateRegion, resetToDefaults, setIntensity, toggleEnabled }}
    >
      {children}
    </ChromaticSettingsContext.Provider>
  );
}

/** Hook to access chromatic theming settings. Must be used within a {@link ChromaticSettingsProvider}. */
export function useChromaticSettings(): ChromaticSettingsContextValue {
  const ctx = useContext(ChromaticSettingsContext);
  if (!ctx) {
    throw new Error('useChromaticSettings must be used within a ChromaticSettingsProvider');
  }
  return ctx;
}
