'use client';

import { useState, useCallback } from 'react';

export type AgentMode = 'orchestrated' | 'solo';
export type IntentMode = 'code' | 'ask' | 'plan' | 'debug';

const INTENT_MODES: IntentMode[] = ['code', 'ask', 'plan', 'debug'];

export interface AgentSettings {
  mode: AgentMode;
  model: string;
  intentMode: IntentMode;
}

const STORAGE_KEY = 'synapse-agent-settings';
const DEFAULT_SETTINGS: AgentSettings = {
  mode: 'orchestrated',
  model: 'claude-sonnet-4-20250514',
  intentMode: 'code',
};

function loadSettings(): AgentSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'solo' ? 'solo' : 'orchestrated',
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_SETTINGS.model,
      intentMode: INTENT_MODES.includes(parsed.intentMode) ? parsed.intentMode : DEFAULT_SETTINGS.intentMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AgentSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}

export function useAgentSettings() {
  const [settings, setSettingsState] = useState<AgentSettings>(loadSettings);

  const setMode = useCallback((mode: AgentMode) => {
    setSettingsState((prev) => {
      const next = { ...prev, mode };
      saveSettings(next);
      return next;
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setSettingsState((prev) => {
      const next = { ...prev, model };
      saveSettings(next);
      return next;
    });
  }, []);

  const setIntentMode = useCallback((intentMode: IntentMode) => {
    setSettingsState((prev) => {
      const next = { ...prev, intentMode };
      saveSettings(next);
      return next;
    });
  }, []);

  return {
    mode: settings.mode,
    model: settings.model,
    intentMode: settings.intentMode,
    settings,
    setMode,
    setModel,
    setIntentMode,
  };
}
