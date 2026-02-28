'use client';

import { useState, useCallback } from 'react';

/** @deprecated Use maxAgents + specialistMode instead. Kept for localStorage migration. */
export type AgentMode = 'orchestrated' | 'solo';
export type IntentMode = 'code' | 'ask' | 'plan' | 'debug';
export type MaxAgents = 1 | 2 | 3 | 4;

const INTENT_MODES: IntentMode[] = ['code', 'ask', 'plan', 'debug'];
const VALID_MAX_AGENTS: readonly MaxAgents[] = [1, 2, 3, 4] as const;

export interface AgentSettings {
  specialistMode: boolean;
  model: string;
  intentMode: IntentMode;
  maxAgents: MaxAgents;
  verbose: boolean;
  maxQuality: boolean;
  useFlatPipeline: boolean;
}

const STORAGE_KEY = 'synapse-agent-settings';
const DEFAULT_SETTINGS: AgentSettings = {
  specialistMode: false,
  model: 'claude-sonnet-4-6',
  intentMode: 'code',
  maxAgents: 1,
  verbose: false,
  maxQuality: false,
  useFlatPipeline: true,
};

function loadSettings(): AgentSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);

    // Migration: convert old mode field to specialistMode + maxAgents
    let specialistMode = DEFAULT_SETTINGS.specialistMode;
    let maxAgents: MaxAgents = VALID_MAX_AGENTS.includes(parsed.maxAgents)
      ? parsed.maxAgents
      : DEFAULT_SETTINGS.maxAgents;

    if ('mode' in parsed && !('specialistMode' in parsed)) {
      if (parsed.mode === 'solo') {
        maxAgents = 1;
        specialistMode = false;
      } else {
        specialistMode = true;
      }
    } else {
      specialistMode = typeof parsed.specialistMode === 'boolean'
        ? parsed.specialistMode
        : DEFAULT_SETTINGS.specialistMode;
    }

    return {
      specialistMode,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_SETTINGS.model,
      intentMode: INTENT_MODES.includes(parsed.intentMode) ? parsed.intentMode : DEFAULT_SETTINGS.intentMode,
      maxAgents,
      verbose: typeof parsed.verbose === 'boolean' ? parsed.verbose : DEFAULT_SETTINGS.verbose,
      maxQuality: typeof parsed.maxQuality === 'boolean' ? parsed.maxQuality : DEFAULT_SETTINGS.maxQuality,
      useFlatPipeline: typeof parsed.useFlatPipeline === 'boolean' ? parsed.useFlatPipeline : DEFAULT_SETTINGS.useFlatPipeline,
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

  const setSpecialistMode = useCallback((specialistMode: boolean) => {
    setSettingsState((prev) => {
      const next = { ...prev, specialistMode };
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

  const setMaxQuality = useCallback((maxQuality: boolean) => {
    setSettingsState((prev) => {
      const next = { ...prev, maxQuality };
      saveSettings(next);
      return next;
    });
  }, []);

  const setUseFlatPipeline = useCallback((useFlatPipeline: boolean) => {
    setSettingsState((prev) => {
      const next = { ...prev, useFlatPipeline };
      saveSettings(next);
      return next;
    });
  }, []);

  return {
    specialistMode: settings.maxAgents > 1,
    model: settings.model,
    intentMode: settings.intentMode,
    maxAgents: settings.maxAgents,
    verbose: settings.verbose,
    maxQuality: settings.maxQuality,
    useFlatPipeline: settings.useFlatPipeline,
    settings,
    setSpecialistMode,
    setModel,
    setIntentMode,
    setMaxAgents,
    setVerbose,
    setMaxQuality,
    setUseFlatPipeline,
  };
}
