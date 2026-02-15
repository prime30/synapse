'use client';

import { useState, useCallback } from 'react';

export type AgentMode = 'orchestrated' | 'solo';
export type IntentMode = 'code' | 'ask' | 'plan' | 'debug';
export type MaxAgents = 1 | 2 | 3 | 4;

const INTENT_MODES: IntentMode[] = ['code', 'ask', 'plan', 'debug'];
const VALID_MAX_AGENTS: readonly MaxAgents[] = [1, 2, 3, 4] as const;

export interface AgentSettings {
  mode: AgentMode;
  model: string;
  intentMode: IntentMode;
  maxAgents: MaxAgents;
  verbose: boolean;
}

const STORAGE_KEY = 'synapse-agent-settings';
const DEFAULT_SETTINGS: AgentSettings = {
  mode: 'orchestrated',
  model: 'claude-sonnet-4-5-20250929',
  intentMode: 'code',
  maxAgents: 1,
  verbose: false,
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
      maxAgents: VALID_MAX_AGENTS.includes(parsed.maxAgents) ? parsed.maxAgents : DEFAULT_SETTINGS.maxAgents,
      verbose: typeof parsed.verbose === 'boolean' ? parsed.verbose : DEFAULT_SETTINGS.verbose,
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

  const setMaxAgents = useCallback((maxAgents: MaxAgents) => {
    setSettingsState((prev) => {
      const next = { ...prev, maxAgents };
      saveSettings(next);
      return next;
    });
  }, []);

  const setVerbose = useCallback((verbose: boolean) => {
    setSettingsState((prev) => {
      const next = { ...prev, verbose };
      saveSettings(next);
      return next;
    });
  }, []);

  return {
    mode: settings.mode,
    model: settings.model,
    intentMode: settings.intentMode,
    maxAgents: settings.maxAgents,
    verbose: settings.verbose,
    settings,
    setMode,
    setModel,
    setIntentMode,
    setMaxAgents,
    setVerbose,
  };
}
