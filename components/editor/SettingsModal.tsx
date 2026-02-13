'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditorSettings, type Preset } from '@/hooks/useEditorSettings';
import { useChromaticSettings } from '@/hooks/useChromaticSettings';
import { loadKeybindings, saveKeybindings, resetKeybindings, getEffectiveKey, type KeyBinding } from '@/lib/editor/keyboard-config';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'editor' | 'appearance' | 'preview' | 'storage' | 'keys';

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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: 'comfort',
    label: 'Comfort',
    description: 'Easy on the eyes',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    id: 'power',
    label: 'Power',
    description: 'All features on',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    id: 'preview',
    label: 'Preview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    id: 'keys',
    label: 'Keys',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-100 dark:focus-visible:ring-offset-[#0a0a0a] ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked ? 'bg-sky-500 dark:bg-sky-500' : 'bg-stone-300 dark:bg-white/20'
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
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium ide-text-2">{label}</p>
        {description && <p className="text-xs ide-text-muted mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
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

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSetting, applyPreset, resetToDefaults } = useEditorSettings();
  const chromatic = useChromaticSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const [keybindings, setKeybindings] = useState<KeyBinding[]>(loadKeybindings);
  const [recordingId, setRecordingId] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ide-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="ide-surface-pop rounded-xl shadow-2xl w-full max-w-lg mx-4 border ide-border flex flex-col max-h-[90vh]">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold ide-text">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md ide-text-3 hover:ide-text ide-hover transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Quick Presets ───────────────────────────────────────── */}
        <div className="px-6 pb-4">
          <p className="text-[11px] font-medium tracking-widest uppercase ide-text-muted mb-3">
            Quick Presets
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_CARDS.map((card) => {
              const isActive = settings.preset === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => applyPreset(card.id)}
                  className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-4 transition-all ${
                    isActive
                      ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/10 ide-text'
                      : 'ide-border ide-surface-inset ide-text-3 hover:ide-border hover:ide-text-2'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-2 right-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500 dark:text-sky-400">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                  <span className={isActive ? 'text-sky-500 dark:text-sky-400' : ''}>{card.icon}</span>
                  <span className="text-sm font-medium">{card.label}</span>
                  <span className="text-[11px] ide-text-muted">{card.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        <div className="px-6">
          <div className="inline-flex rounded-lg ide-surface-inset p-0.5">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'ide-active ide-text'
                      : 'ide-text-muted hover:ide-text-2 ide-hover'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {activeTab === 'editor' && (
            <div className="divide-y ide-border-subtle">
              {/* Font Size */}
              <SettingRow label="Font Size">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={24}
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
                    className="w-32 accent-sky-500"
                  />
                  <span className="text-sm ide-text-3 tabular-nums w-10 text-right">
                    {settings.fontSize}px
                  </span>
                </div>
              </SettingRow>

              {/* Tab Size */}
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

              {/* Word Wrap */}
              <SettingRow label="Word Wrap" description="Wrap long lines of code">
                <Toggle checked={settings.wordWrap} onChange={(v) => updateSetting('wordWrap', v)} />
              </SettingRow>

              {/* Minimap */}
              <SettingRow label="Minimap" description="Show code minimap on the right">
                <Toggle checked={settings.minimap} onChange={(v) => updateSetting('minimap', v)} />
              </SettingRow>

              {/* Line Numbers */}
              <SettingRow label="Line Numbers" description="Show line numbers in gutter">
                <Toggle checked={settings.lineNumbers} onChange={(v) => updateSetting('lineNumbers', v)} />
              </SettingRow>

              {/* Bracket Matching */}
              <SettingRow label="Bracket Matching" description="Highlight matching brackets">
                <Toggle checked={settings.bracketMatching} onChange={(v) => updateSetting('bracketMatching', v)} />
              </SettingRow>

              {/* Separator */}
              <div className="pt-2" />

              {/* Auto-Save */}
              <SettingRow label="Auto-Save" description="Automatically save files after changes">
                <Toggle checked={settings.autoSave} onChange={(v) => updateSetting('autoSave', v)} />
              </SettingRow>

              {/* Auto-Save Delay */}
              <SettingRow label="Auto-Save Delay" description="Time to wait before auto-saving">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={settings.autoSaveDelay}
                    onChange={(e) => updateSetting('autoSaveDelay', Number(e.target.value))}
                    className="w-32 accent-sky-500"
                    disabled={!settings.autoSave}
                  />
                  <span className={`text-sm tabular-nums w-14 text-right ${settings.autoSave ? 'ide-text-3' : 'ide-text-quiet'}`}>
                    {settings.autoSaveDelay}ms
                  </span>
                </div>
              </SettingRow>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="divide-y ide-border-subtle">
              {/* Section header */}
              <div className="pb-3">
                <p className="text-xs font-medium tracking-widest uppercase ide-text-muted">
                  Chromatic IDE
                </p>
                <p className="text-xs ide-text-quiet mt-1">
                  IDE tints subtly based on your theme&apos;s color palette
                </p>
              </div>

              {/* Enable toggle */}
              <SettingRow label="Chromatic Theming" description="Tint the IDE with your theme's colors">
                <Toggle checked={chromatic.settings.enabled} onChange={() => chromatic.toggleEnabled()} />
              </SettingRow>

              {/* Intensity slider */}
              <SettingRow label="Intensity" description="How strongly the theme colors tint the IDE">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={chromatic.settings.intensity}
                    onChange={(e) => chromatic.setIntensity(Number(e.target.value))}
                    className="w-32 accent-sky-500"
                    disabled={!chromatic.settings.enabled}
                  />
                  <span className={`text-sm tabular-nums w-10 text-right ${chromatic.settings.enabled ? 'ide-text-3' : 'ide-text-quiet'}`}>
                    {chromatic.settings.intensity}%
                  </span>
                </div>
              </SettingRow>

              {/* Separator */}
              <div className="pt-2" />

              {/* Per-region controls header */}
              <SettingRow label="Regions" description="Choose which areas are tinted">
                <span />
              </SettingRow>

              {/* Region toggles */}
              <SettingRow label="Sidebar">
                <Toggle
                  checked={chromatic.settings.regions.sidebar}
                  onChange={(v) => chromatic.updateRegion('sidebar', v)}
                  disabled={!chromatic.settings.enabled}
                />
              </SettingRow>
              <SettingRow label="Editor">
                <Toggle
                  checked={chromatic.settings.regions.editor}
                  onChange={(v) => chromatic.updateRegion('editor', v)}
                  disabled={!chromatic.settings.enabled}
                />
              </SettingRow>
              <SettingRow label="Preview">
                <Toggle
                  checked={chromatic.settings.regions.preview}
                  onChange={(v) => chromatic.updateRegion('preview', v)}
                  disabled={!chromatic.settings.enabled}
                />
              </SettingRow>
              <SettingRow label="Status Bar">
                <Toggle
                  checked={chromatic.settings.regions.statusBar}
                  onChange={(v) => chromatic.updateRegion('statusBar', v)}
                  disabled={!chromatic.settings.enabled}
                />
              </SettingRow>
              <SettingRow label="Activity Bar">
                <Toggle
                  checked={chromatic.settings.regions.activityBar}
                  onChange={(v) => chromatic.updateRegion('activityBar', v)}
                  disabled={!chromatic.settings.enabled}
                />
              </SettingRow>

              {/* Transition duration */}
              <div className="pt-2" />
              <SettingRow label="Transition Speed" description="Duration of color transitions on project switch">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={200}
                    max={3000}
                    step={100}
                    value={chromatic.settings.transitionDuration}
                    onChange={(e) => chromatic.updateSetting('transitionDuration', Number(e.target.value))}
                    className="w-32 accent-sky-500"
                  />
                  <span className="text-sm ide-text-3 tabular-nums w-14 text-right">
                    {chromatic.settings.transitionDuration}ms
                  </span>
                </div>
              </SettingRow>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm ide-text-muted">Preview settings coming soon.</p>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm ide-text-muted">Storage settings coming soon.</p>
            </div>
          )}

          {activeTab === 'keys' && (
            <div className="space-y-6">
              {CATEGORY_ORDER.map((cat) => {
                const bindings = keybindings.filter((b) => b.category === cat);
                if (bindings.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="text-xs font-medium tracking-widest uppercase ide-text-muted mb-3">
                      {CATEGORY_LABELS[cat]}
                    </p>
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
                                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-stone-100 dark:focus:ring-offset-[#0a0a0a] min-w-[100px] justify-center ${
                                  isRecording
                                    ? 'border-sky-500 bg-sky-500/20 text-sky-600 dark:text-sky-300'
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
                                  <span className="text-sm">↺</span>
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
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setKeybindings(resetKeybindings());
                    setRecordingId(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md ide-surface-input px-3 py-1.5 text-sm ide-text-2 hover:ide-text ide-hover transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reset All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t ide-border">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm ide-text-3 hover:ide-text-2 transition-colors"
            title="Start onboarding tour (coming soon)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Start Tour
          </button>
          <button
            type="button"
            onClick={resetToDefaults}
            className="inline-flex items-center gap-1.5 rounded-md ide-surface-input px-3 py-1.5 text-sm ide-text-2 hover:ide-text ide-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
