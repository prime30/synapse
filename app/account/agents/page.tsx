'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot,
  Brain,
  Bell,
  ChevronDown,
  MessageSquare,
  Check,
} from 'lucide-react';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import type { MaxAgents } from '@/hooks/useAgentSettings';

/* ------------------------------------------------------------------ */
/*  Toggle Switch (matches settings page pattern)                      */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.145_0_0)] dark:focus-visible:ring-offset-[oklch(0.145_0_0)] ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-pointer'
      } ${checked ? 'bg-emerald-600' : 'ide-surface-inset'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Select component                                                   */
/* ------------------------------------------------------------------ */

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ide-input appearance-none w-full sm:w-64 rounded-md px-3 py-2 pr-8 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 ide-text-muted pointer-events-none" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Model & mode options                                               */
/* ------------------------------------------------------------------ */

const MODEL_OPTIONS = [
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'auto', label: 'Auto-route' },
];

const MODE_OPTIONS = [
  { value: 'full', label: 'Full Orchestration' },
  { value: 'pm-only', label: 'PM Only' },
  { value: 'direct', label: 'Direct Specialist' },
];

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'claude-opus-4': 'Best quality for complex tasks. Slower and more expensive.',
  'claude-sonnet-4': 'Recommended for most tasks. Good balance of speed and quality.',
  'gpt-4o': 'OpenAI flagship model. Fast with strong general performance.',
  auto: 'Automatically selects the best model based on task complexity.',
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  full: 'PM coordinates specialist agents automatically.',
  'pm-only': 'PM agent only, no specialist delegation.',
  direct: 'Send prompts directly to a specialist agent.',
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function settingsToMode(specialistMode: boolean, maxAgents: number): string {
  if (!specialistMode) return 'direct';
  return maxAgents > 1 ? 'full' : 'pm-only';
}

export default function AgentSettingsPage() {
  const agentSettings = useAgentSettings();

  const derivedMode = settingsToMode(agentSettings.specialistMode, agentSettings.maxAgents);
  const [mode, setModeLocal] = useState(derivedMode);

  // Behavior
  const [autoApply, setAutoApply] = useState(false);
  const [planApproval, setPlanApproval] = useState(true);

  // Notifications
  const [emailOnComplete, setEmailOnComplete] = useState(false);
  const [slackNotif, setSlackNotif] = useState(false);

  // Save state
  const [saved, setSaved] = useState(false);

  const handleModelChange = useCallback((v: string) => {
    agentSettings.setModel(v);
  }, [agentSettings]);

  const handleModeChange = useCallback((v: string) => {
    setModeLocal(v);
  }, []);

  const handleSave = useCallback(() => {
    // Persist model (already persisted on change, but ensure latest)
    agentSettings.setModel(agentSettings.model);

    // Persist mode mapping
    switch (mode) {
      case 'full':
        agentSettings.setSpecialistMode(true);
        agentSettings.setMaxAgents(3 as MaxAgents);
        break;
      case 'pm-only':
        agentSettings.setSpecialistMode(true);
        agentSettings.setMaxAgents(1 as MaxAgents);
        break;
      case 'direct':
        agentSettings.setSpecialistMode(false);
        agentSettings.setMaxAgents(1 as MaxAgents);
        break;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [agentSettings, mode]);

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold">Agent Settings</h1>
        <p className="ide-text-muted text-sm mt-1">
          Configure default AI model, orchestration mode, and notifications.
        </p>
      </div>

      {/* ── Defaults ─────────────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Bot className="h-5 w-5 ide-text-muted" />
          <h2 className="text-base font-medium">Defaults</h2>
        </div>

        <div className="space-y-6">
          {/* Default Model */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
            <p className="text-sm font-medium ide-text">Default Model</p>
            <p className="text-xs ide-text-muted mt-0.5 max-w-sm">
                {MODEL_DESCRIPTIONS[agentSettings.model] ?? ''}
              </p>
            </div>
            <Select
              value={agentSettings.model}
              onChange={handleModelChange}
              options={MODEL_OPTIONS}
            />
          </div>

          <div className="border-t ide-border" />

          {/* Default Agent Mode */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
            <p className="text-sm font-medium ide-text">Default Agent Mode</p>
            <p className="text-xs ide-text-muted mt-0.5 max-w-sm">
                {MODE_DESCRIPTIONS[mode]}
              </p>
            </div>
            <Select
              value={mode}
              onChange={handleModeChange}
              options={MODE_OPTIONS}
            />
          </div>
        </div>
      </section>

      {/* ── Behavior ─────────────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Brain className="h-5 w-5 ide-text-muted" />
          <h2 className="text-base font-medium">Behavior</h2>
        </div>

        <div className="space-y-6">
          {/* Auto-apply suggestions */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-apply suggestions</p>
              <p className="text-xs ide-text-muted mt-0.5">
                Apply code changes without showing diff preview first.
              </p>
            </div>
            <Toggle checked={autoApply} onChange={setAutoApply} />
          </div>

          <div className="border-t ide-border" />

          {/* Plan approval required */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium ide-text">Plan approval required</p>
              <p className="text-xs ide-text-muted mt-0.5">
                Show approval dialog before multi-step agent executions.
              </p>
            </div>
            <Toggle checked={planApproval} onChange={setPlanApproval} />
          </div>
        </div>
      </section>

      {/* ── Notifications ────────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="h-5 w-5 ide-text-muted" />
          <h2 className="text-base font-medium">Notifications</h2>
        </div>

        <div className="space-y-6">
          {/* Email on completion */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium ide-text">Email on completion</p>
              <p className="text-xs ide-text-muted mt-0.5">
                Get an email when a long-running agent task completes.
              </p>
            </div>
            <Toggle checked={emailOnComplete} onChange={setEmailOnComplete} />
          </div>

          <div className="border-t ide-border" />

          {/* Slack notifications */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium ide-text">Slack notifications</p>
              <p className="text-xs ide-text-muted mt-0.5">
                Requires Slack integration.{' '}
                <Link
                  href="/account/integrations"
                  className="text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Connect in Integrations
                </Link>
                .
              </p>
            </div>
            <Toggle
              checked={slackNotif}
              onChange={setSlackNotif}
              disabled
            />
          </div>
        </div>
      </section>

      {/* ── Save Button ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
        >
          Save Changes
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400 animate-in fade-in duration-200">
            <Check className="h-4 w-4" />
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}
