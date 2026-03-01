'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditorSettings, type Preset } from '@/hooks/useEditorSettings';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import { useChromaticSettings } from '@/hooks/useChromaticSettings';
import { loadKeybindings, saveKeybindings, resetKeybindings, getEffectiveKey, type KeyBinding } from '@/lib/editor/keyboard-config';
import { SkillBrowser } from '@/components/editor/SkillBrowser';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { Modal } from '@/components/ui/Modal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

interface CustomProvider {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  default_model: string;
  is_enabled: boolean;
  health_status: 'healthy' | 'degraded' | 'down' | 'unknown';
  last_health_check: string | null;
  created_at: string;
}

type SettingsTab = 'editor' | 'appearance' | 'keys' | 'providers' | 'skills';

/* ------------------------------------------------------------------ */
/*  Preset card data                                                   */
/* ------------------------------------------------------------------ */

const PRESET_CARDS: {
  id: Exclude<Preset, 'custom'>;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'fast',
    label: 'Fast',
    description: 'Speed optimized',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: 'comfort',
    label: 'Comfort',
    description: 'Easy on the eyes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    id: 'power',
    label: 'Power',
    description: 'All features on',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Tab definitions (sidebar navigation)                               */
/* ------------------------------------------------------------------ */

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    id: 'keys',
    label: 'Keyboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="6" y1="8" x2="6.01" y2="8" />
        <line x1="10" y1="8" x2="10.01" y2="8" />
        <line x1="14" y1="8" x2="14.01" y2="8" />
        <line x1="18" y1="8" x2="18.01" y2="8" />
        <line x1="8" y1="12" x2="8.01" y2="12" />
        <line x1="12" y1="12" x2="12.01" y2="12" />
        <line x1="16" y1="12" x2="16.01" y2="12" />
        <line x1="7" y1="16" x2="17" y2="16" />
      </svg>
    ),
  },
  {
    id: 'providers',
    label: 'Providers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Reusable UI pieces                                                 */
/* ------------------------------------------------------------------ */

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-100 dark:focus-visible:ring-offset-[oklch(0.145_0_0)] ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked ? 'bg-sky-500 dark:bg-sky-500' : 'bg-stone-300 dark:bg-[#2a2a2a]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium ide-text-2">{label}</p>
        {description && <p className="text-xs ide-text-muted mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pb-1 mb-1">
      <h3 className="text-xs font-semibold tracking-widest uppercase ide-text-muted">{title}</h3>
      {description && <p className="text-xs ide-text-quiet mt-1">{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Keybinding helpers                                                 */
/* ------------------------------------------------------------------ */

const CATEGORY_ORDER: KeyBinding['category'][] = ['editor', 'navigation', 'ai', 'general'];
const CATEGORY_LABELS: Record<KeyBinding['category'], string> = {
  editor: 'Editor',
  navigation: 'Navigation',
  ai: 'AI',
  general: 'General',
};

function formatKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  const keyMap: Record<string, string> = { ' ': 'Space' };
  const key = keyMap[e.key] ?? e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    parts.push(key);
  }
  return parts.length > 0 ? parts.join('+') : e.key;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SettingsModal({ isOpen, onClose, projectId }: SettingsModalProps) {
  const { settings, updateSetting, applyPreset, resetToDefaults } = useEditorSettings();
  const { useFlatPipeline, setUseFlatPipeline } = useAgentSettings();
  const chromatic = useChromaticSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const [keybindings, setKeybindings] = useState<KeyBinding[]>(loadKeybindings);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Providers state
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', displayName: '', baseURL: '', apiKey: '', defaultModel: '' });
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [healthCheckingId, setHealthCheckingId] = useState<string | null>(null);

  const handleKeyCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingId) return;
      e.preventDefault();
      e.stopPropagation();
      const combo = formatKeyCombo(e);
      setKeybindings((prev) => {
        const next = prev.map((b) =>
          b.id === recordingId ? { ...b, customKeys: combo } : b
        );
        saveKeybindings(next);
        return next;
      });
      setRecordingId(null);
    },
    [recordingId]
  );

  useEffect(() => {
    if (!recordingId) return;
    window.addEventListener('keydown', handleKeyCapture, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyCapture, { capture: true });
  }, [recordingId, handleKeyCapture]);

  // Fetch providers when Providers tab is active
  useEffect(() => {
    if (activeTab !== 'providers' || !isOpen) return;
    let cancelled = false;
    setProvidersLoading(true);
    fetch('/api/providers')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setProviders(json.data ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setProvidersLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, isOpen]);

  const handleAddProvider = async () => {
    setProviderSaving(true);
    setProviderError(null);
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProvider.name,
          displayName: newProvider.displayName || newProvider.name,
          baseURL: newProvider.baseURL,
          apiKey: newProvider.apiKey,
          defaultModel: newProvider.defaultModel,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add provider');
      setProviders((prev) => [...prev, json.data]);
      setNewProvider({ name: '', displayName: '', baseURL: '', apiKey: '', defaultModel: '' });
      setShowAddProvider(false);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Failed to add provider');
    } finally {
      setProviderSaving(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await fetch('/api/providers?id=' + id, { method: 'DELETE' });
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  };

  const handleToggleProvider = async (id: string, enabled: boolean) => {
    try {
      await fetch('/api/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isEnabled: enabled }),
      });
      setProviders((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_enabled: enabled } : p))
      );
    } catch { /* ignore */ }
  };

  const handleHealthCheck = async (id: string) => {
    setHealthCheckingId(id);
    try {
      const res = await fetch('/api/providers/' + id + '/health', { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, health_status: json.data.status, last_health_check: new Date().toISOString() }
              : p
          )
        );
      }
    } catch { /* ignore */ }
    setHealthCheckingId(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      customMaxWidth="max-w-[720px]"
      bodyClassName="p-0"
      className="h-[min(85vh,640px)]"
    >
      {/* ── Body: sidebar + content ─────────────────────────────── */}
      <div className="flex flex-1 min-h-0 h-full">
          {/* Sidebar nav */}
          <nav className="w-44 shrink-0 border-r ide-border-subtle py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
            {TABS.filter((tab) => (tab.id === 'skills' ? !!projectId : true)).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors text-left w-full ${
                    isActive
                      ? 'ide-active ide-text bg-sky-500/8 dark:bg-sky-500/10'
                      : 'ide-text-3 hover:ide-text-2 ide-hover'
                  }`}
                >
                  <span className={isActive ? 'text-sky-500 dark:text-sky-400' : ''}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}

            {/* Spacer + reset at bottom */}
            <div className="flex-1" />
            <div className="border-t ide-border-subtle mt-2 pt-2">
              <button
                type="button"
                onClick={resetToDefaults}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-[13px] ide-text-muted hover:ide-text-2 ide-hover transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Reset All
              </button>
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {/* ── EDITOR TAB ───────────────────────────────────────── */}
            {activeTab === 'editor' && (
              <div className="space-y-6">
                {/* Presets */}
                <div>
                  <SectionHeader title="Presets" description="Quickly apply a configuration profile" />
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {PRESET_CARDS.map((card) => {
                      const isActive = settings.preset === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => applyPreset(card.id)}
                          className={`relative flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-all ${
                            isActive
                              ? 'border-sky-500 bg-sky-500/8 dark:bg-sky-500/10 ide-text'
                              : 'ide-border ide-surface-inset ide-text-3 hover:ide-text-2 hover:border-stone-300 dark:hover:border-[#2e2e2e]'
                          }`}
                        >
                          {isActive && (
                            <span className="absolute top-1.5 right-1.5">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500 dark:text-sky-400">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                          <span className={isActive ? 'text-sky-500 dark:text-sky-400' : ''}>{card.icon}</span>
                          <span className="text-[13px] font-medium">{card.label}</span>
                          <span className="text-[11px] ide-text-muted">{card.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Display settings */}
                <div>
                  <SectionHeader title="Display" />
                  <div className="divide-y ide-border-subtle">
                    <SettingRow label="Font Size">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={10}
                          max={24}
                          value={settings.fontSize}
                          onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
                          className="w-28 accent-sky-500"
                        />
                        <span className="text-sm ide-text-3 tabular-nums w-10 text-right">
                          {settings.fontSize}px
                        </span>
                      </div>
                    </SettingRow>

                    <SettingRow label="Tab Size">
                      <select
                        value={settings.tabSize}
                        onChange={(e) => updateSetting('tabSize', Number(e.target.value) as 2 | 4)}
                        className="rounded-md ide-surface-input border ide-border px-3 py-1.5 text-sm ide-text focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
                      >
                        <option value={2}>2 spaces</option>
                        <option value={4}>4 spaces</option>
                      </select>
                    </SettingRow>

                    <SettingRow label="Word Wrap" description="Wrap long lines of code">
                      <Toggle checked={settings.wordWrap} onChange={(v) => updateSetting('wordWrap', v)} />
                    </SettingRow>

                    <SettingRow label="Minimap" description="Show code minimap on the right">
                      <Toggle checked={settings.minimap} onChange={(v) => updateSetting('minimap', v)} />
                    </SettingRow>

                    <SettingRow label="Line Numbers" description="Show line numbers in gutter">
                      <Toggle checked={settings.lineNumbers} onChange={(v) => updateSetting('lineNumbers', v)} />
                    </SettingRow>

                    <SettingRow label="Bracket Matching" description="Highlight matching brackets">
                      <Toggle checked={settings.bracketMatching} onChange={(v) => updateSetting('bracketMatching', v)} />
                    </SettingRow>
                  </div>
                </div>

                {/* Behavior settings */}
                <div>
                  <SectionHeader title="Behavior" />
                  <div className="divide-y ide-border-subtle">
                    <SettingRow label="Auto-Save" description="Automatically save files after changes">
                      <Toggle checked={settings.autoSave} onChange={(v) => updateSetting('autoSave', v)} />
                    </SettingRow>

                    <SettingRow label="Auto-Save Delay" description="Time to wait before auto-saving">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={500}
                          max={5000}
                          step={100}
                          value={settings.autoSaveDelay}
                          onChange={(e) => updateSetting('autoSaveDelay', Number(e.target.value))}
                          className="w-28 accent-sky-500"
                          disabled={!settings.autoSave}
                        />
                        <span className={`text-sm tabular-nums w-14 text-right ${settings.autoSave ? 'ide-text-3' : 'ide-text-quiet'}`}>
                          {settings.autoSaveDelay}ms
                        </span>
                      </div>
                    </SettingRow>

                    <SettingRow label="Multi-Agent Mode" description="Use PM + specialists for large refactors (10+ files). Off = single fast agent.">
                      <Toggle checked={!useFlatPipeline} onChange={(v) => setUseFlatPipeline(!v)} />
                    </SettingRow>
                  </div>
                </div>
              </div>
            )}

            {/* ── APPEARANCE TAB ────────────────────────────────────── */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* Chromatic theming */}
                <div>
                  <SectionHeader
                    title="Chromatic IDE"
                    description="IDE tints subtly based on your theme's color palette"
                  />
                  <div className="divide-y ide-border-subtle">
                    <SettingRow label="Enable" description="Tint the IDE with your theme's colors">
                      <Toggle checked={chromatic.settings.enabled} onChange={() => chromatic.toggleEnabled()} />
                    </SettingRow>

                    <SettingRow label="Intensity" description="How strongly the colors tint">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={chromatic.settings.intensity}
                          onChange={(e) => chromatic.setIntensity(Number(e.target.value))}
                          className="w-28 accent-sky-500"
                          disabled={!chromatic.settings.enabled}
                        />
                        <span className={`text-sm tabular-nums w-10 text-right ${chromatic.settings.enabled ? 'ide-text-3' : 'ide-text-quiet'}`}>
                          {chromatic.settings.intensity}%
                        </span>
                      </div>
                    </SettingRow>

                    <SettingRow label="Transition Speed" description="Color transition duration">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={200}
                          max={3000}
                          step={100}
                          value={chromatic.settings.transitionDuration}
                          onChange={(e) => chromatic.updateSetting('transitionDuration', Number(e.target.value))}
                          className="w-28 accent-sky-500"
                        />
                        <span className="text-sm ide-text-3 tabular-nums w-14 text-right">
                          {chromatic.settings.transitionDuration}ms
                        </span>
                      </div>
                    </SettingRow>
                  </div>
                </div>

                {/* Region controls */}
                <div>
                  <SectionHeader title="Tinted Regions" description="Choose which areas are tinted" />
                  <div className="divide-y ide-border-subtle">
                    {([
                      ['sidebar', 'Sidebar'],
                      ['editor', 'Editor'],
                      ['preview', 'Preview'],
                      ['statusBar', 'Status Bar'],
                      ['activityBar', 'Activity Bar'],
                    ] as const).map(([key, label]) => (
                      <SettingRow key={key} label={label}>
                        <Toggle
                          checked={chromatic.settings.regions[key]}
                          onChange={(v) => chromatic.updateRegion(key, v)}
                          disabled={!chromatic.settings.enabled}
                        />
                      </SettingRow>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── KEYBOARD TAB ──────────────────────────────────────── */}
            {activeTab === 'keys' && (
              <div className="space-y-6">
                {CATEGORY_ORDER.map((cat) => {
                  const bindings = keybindings.filter((b) => b.category === cat);
                  if (bindings.length === 0) return null;
                  return (
                    <div key={cat}>
                      <SectionHeader title={CATEGORY_LABELS[cat]} />
                      <div className="divide-y ide-border-subtle">
                        {bindings.map((binding) => {
                          const effectiveKey = getEffectiveKey(binding);
                          const isCustom = binding.customKeys !== null;
                          const isRecording = recordingId === binding.id;
                          return (
                            <SettingRow
                              key={binding.id}
                              label={binding.label}
                              description={binding.description}
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRecordingId(isRecording ? null : binding.id)}
                                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-stone-100 dark:focus:ring-offset-[oklch(0.145_0_0)] min-w-[100px] justify-center ${
                                    isRecording
                                      ? 'border-sky-500 bg-sky-500/20 text-sky-600 dark:text-sky-300 animate-pulse'
                                      : isCustom
                                        ? 'border-sky-500/60 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                        : 'ide-border ide-surface-input ide-text-3'
                                  }`}
                                >
                                  {isRecording ? 'Press keys...' : effectiveKey}
                                </button>
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setKeybindings((prev) => {
                                        const next = prev.map((b) =>
                                          b.id === binding.id ? { ...b, customKeys: null } : b
                                        );
                                        saveKeybindings(next);
                                        return next;
                                      });
                                    }}
                                    className="p-1 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                                    title="Reset to default"
                                    aria-label="Reset to default"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                      <path d="M3 3v5h5" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </SettingRow>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setKeybindings(resetKeybindings());
                      setRecordingId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md ide-surface-inset border ide-border px-3 py-1.5 text-[13px] ide-text-3 hover:ide-text-2 ide-hover transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Reset All Shortcuts
                  </button>
                </div>
              </div>
            )}

            {/* ── PROVIDERS TAB ─────────────────────────────────────── */}
            {activeTab === 'providers' && (
              <div className="space-y-6">
                {/* Built-in providers */}
                <div>
                  <SectionHeader title="Built-in Providers" />
                  <div className="space-y-1.5 mt-2">
                    {[
                      { name: 'Anthropic', model: 'Claude Sonnet 4.5', status: process.env.NEXT_PUBLIC_HAS_ANTHROPIC === 'true' ? 'configured' : 'needs key' },
                      { name: 'OpenAI', model: 'GPT-4o', status: process.env.NEXT_PUBLIC_HAS_OPENAI === 'true' ? 'configured' : 'needs key' },
                      { name: 'Google', model: 'Gemini 2.0 Flash', status: process.env.NEXT_PUBLIC_HAS_GOOGLE === 'true' ? 'configured' : 'needs key' },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center justify-between py-2.5 px-3 rounded-lg ide-surface-inset">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${p.status === 'configured' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <div>
                            <p className="text-sm font-medium ide-text-2">{p.name}</p>
                            <p className="text-xs ide-text-muted">{p.model}</p>
                          </div>
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          p.status === 'configured'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {p.status === 'configured' ? 'Active' : 'Not configured'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom providers */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <SectionHeader title="Custom Providers" />
                    <button
                      type="button"
                      onClick={() => setShowAddProvider(!showAddProvider)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add
                    </button>
                  </div>

                  {/* Add provider form */}
                  {showAddProvider && (
                    <div className="rounded-lg border ide-border p-4 mb-3 space-y-3 ide-surface-inset">
                      <p className="text-sm font-medium ide-text-2">
                        Add OpenAI-Compatible Provider
                      </p>
                      <p className="text-xs ide-text-muted">
                        Works with DeepSeek, Groq, Mistral, Fireworks, Together AI, Ollama, and more.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Provider name"
                          value={newProvider.name}
                          onChange={(e) => setNewProvider((prev) => ({ ...prev, name: e.target.value }))}
                          className="col-span-1 ide-input px-3 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Display name (optional)"
                          value={newProvider.displayName}
                          onChange={(e) => setNewProvider((prev) => ({ ...prev, displayName: e.target.value }))}
                          className="col-span-1 ide-input px-3 py-1.5 text-sm"
                        />
                        <input
                          type="url"
                          placeholder="Base URL (e.g. https://api.deepseek.com/v1)"
                          value={newProvider.baseURL}
                          onChange={(e) => setNewProvider((prev) => ({ ...prev, baseURL: e.target.value }))}
                          className="col-span-2 ide-input px-3 py-1.5 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="API Key"
                          value={newProvider.apiKey}
                          onChange={(e) => setNewProvider((prev) => ({ ...prev, apiKey: e.target.value }))}
                          className="col-span-1 ide-input px-3 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Default model"
                          value={newProvider.defaultModel}
                          onChange={(e) => setNewProvider((prev) => ({ ...prev, defaultModel: e.target.value }))}
                          className="col-span-1 ide-input px-3 py-1.5 text-sm"
                        />
                      </div>
                      {providerError && (
                        <p className="text-xs text-red-500 dark:text-red-400">{providerError}</p>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { setShowAddProvider(false); setProviderError(null); }}
                          className="px-3 py-1.5 text-xs font-medium ide-text-3 hover:ide-text-2 transition-colors rounded-md ide-hover"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddProvider}
                          disabled={providerSaving || !newProvider.name || !newProvider.baseURL || !newProvider.apiKey || !newProvider.defaultModel}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {providerSaving ? 'Adding...' : 'Add Provider'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Provider list */}
                  {providersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-xs ide-text-muted">Loading providers...</p>
                    </div>
                  ) : providers.length === 0 && !showAddProvider ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed ide-border">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="ide-text-quiet mb-2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      <p className="text-sm ide-text-muted">No custom providers</p>
                      <p className="text-xs ide-text-quiet mt-1">Add one to use DeepSeek, Groq, and more</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {providers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg ide-surface-inset">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              p.health_status === 'healthy' ? 'bg-emerald-500' :
                              p.health_status === 'degraded' ? 'bg-amber-500' :
                              p.health_status === 'down' ? 'bg-red-500' :
                              'bg-stone-400 dark:bg-stone-600'
                            }`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium ide-text-2 truncate">{p.display_name}</p>
                              <p className="text-xs ide-text-muted truncate">{p.default_model} &middot; {p.base_url}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => handleHealthCheck(p.id)}
                              disabled={healthCheckingId === p.id}
                              className="p-1.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors disabled:opacity-50"
                              title="Run health check"
                            >
                              {healthCheckingId === p.id ? (
                                <LambdaDots size={14} />
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              )}
                            </button>
                            <Toggle
                              checked={p.is_enabled}
                              onChange={(v) => handleToggleProvider(p.id, v)}
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteProvider(p.id)}
                              className="p-1.5 rounded text-red-400 hover:text-red-300 ide-hover transition-colors"
                              title="Delete provider"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SKILLS TAB ───────────────────────────────────────────── */}
            {activeTab === 'skills' && projectId && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold tracking-widest uppercase ide-text-muted mb-1">
                    Knowledge Modules
                  </h3>
                  <p className="text-xs ide-text-quiet mb-3">
                    Enable or disable skills that the agent loads based on your prompts.
                  </p>
                  <SkillBrowser projectId={projectId} />
                </div>
              </div>
            )}
          </div>
        </div>
    </Modal>
  );
}
