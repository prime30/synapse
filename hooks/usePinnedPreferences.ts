'use client';

import { useMemo, useCallback } from 'react';
import { useMemory } from './useMemory';
import type { Preference } from '@/lib/ai/developer-memory';

export interface PinnedPreference {
  id: string;
  rule: string;
  source: 'user_pin' | 'auto_detected';
  createdAt: string;
}

export function usePinnedPreferences(projectId: string) {
  const memory = useMemory(projectId);

  const pins = useMemo(function() {
    return memory.memories
      .filter(function(m) {
        if (m.type !== 'preference') return false;
        const pref = m.content as Preference;
        return pref.category === 'workflow';
      })
      .map(function(m): PinnedPreference {
        const pref = m.content as Preference;
        return {
          id: m.id,
          rule: pref.preference || '',
          source: 'user_pin',
          createdAt: m.createdAt || new Date().toISOString(),
        };
      });
  }, [memory.memories]);

  const addPin = useCallback(async function(rule: string) {
    const content: Preference = {
      category: 'workflow',
      preference: rule,
      observationCount: 1,
    };
    await memory.create('preference', content, 1.0);
  }, [memory]);

  const removePin = useCallback(async function(id: string) {
    await memory.forget(id);
  }, [memory]);

  const getPromptInjection = useCallback(function(): string {
    if (pins.length === 0) return '';
    const lines = pins.map(function(p, i) { return String(i + 1) + '. ' + p.rule; });
    return '[User Preferences]\n' + lines.join('\n');
  }, [pins]);

  return {
    pins: pins,
    isLoading: memory.isLoading,
    addPin: addPin,
    removePin: removePin,
    getPromptInjection: getPromptInjection,
    pinCount: pins.length,
  };
}
