'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Github,
  MessageSquare,
  Key,
  Eye,
  EyeOff,
  X,
  Plus,
  Check,
  AlertCircle,
  Copy,
  Trash2,
  ExternalLink,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'connected' | 'not_connected' | 'coming_soon';
  actionLabel?: string;
  actionHref?: string;
}

interface ProviderKey {
  id: string;
  provider: string;
  icon: string;
  keySuffix: string | null; // last 4 chars if set
  status: 'not_set' | 'valid' | 'invalid';
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const INTEGRATIONS: Integration[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    description:
      'Connect your Shopify store for theme editing and live preview',
    icon: ShoppingBag,
    status: 'not_connected',
    actionLabel: 'Connect',
  },
  {
    id: 'github',
    name: 'GitHub',
    description:
      'Version control and PR creation for your theme files',
    icon: Github,
    status: 'coming_soon',
  },
  {
    id: 'slack',
    name: 'Slack',
    description:
      'Get notified when agents complete tasks',
    icon: MessageSquare,
    status: 'coming_soon',
  },
];

const INITIAL_PROVIDER_KEYS: ProviderKey[] = [
  { id: 'anthropic', provider: 'Anthropic', icon: 'A', keySuffix: null, status: 'not_set' },
  { id: 'openai', provider: 'OpenAI', icon: 'O', keySuffix: null, status: 'not_set' },
  { id: 'google', provider: 'Google AI', icon: 'G', keySuffix: null, status: 'not_set' },
];

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'connected':
    case 'valid':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-full">
          <Check className="h-3 w-3" />
          {status === 'connected' ? 'Connected' : 'Valid'}
        </span>
      );
    case 'not_connected':
    case 'not_set':
      return (
        <span className="text-[10px] font-medium uppercase tracking-wider ide-text-muted ide-surface-input px-2 py-0.5 rounded-full">
          {status === 'not_connected' ? 'Not connected' : 'Not set'}
        </span>
      );
    case 'invalid':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-red-400 bg-red-900/40 px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" />
          Invalid
        </span>
      );
    case 'coming_soon':
      return (
        <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">
          Coming Soon
        </span>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Add API Key Modal                                                  */
/* ------------------------------------------------------------------ */

function AddKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: string;
  onClose: () => void;
  onSave: (key: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(apiKey.trim());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative ide-surface-panel border ide-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold ide-text">Add {provider} API Key</h2>
        <p className="text-sm ide-text-muted mt-1">
          Your key is encrypted at rest and never exposed in the client.
        </p>

        <label className="block mt-5">
          <span className="text-sm ide-text-muted">API Key</span>
          <div className="relative mt-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="ide-input w-full rounded-md px-3 py-2 pr-10 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>

        {saveError && (
          <p className="text-sm text-red-500 mt-3">{saveError}</p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md ide-text-muted ide-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function IntegrationsPage() {
  const [providerKeys, setProviderKeys] = useState(INITIAL_PROVIDER_KEYS);
  const [addKeyModal, setAddKeyModal] = useState<string | null>(null);
  const [platformKeys] = useState<{ id: string; name: string; prefix: string; created: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/billing/api-keys');
        if (!res.ok) return;
        const data = await res.json();
        const keys = data.data ?? data;
        if (Array.isArray(keys)) {
          setProviderKeys((prev) =>
            prev.map((pk) => {
              const match = keys.find((k: { provider: string }) => k.provider === pk.id);
              if (match) {
                return { ...pk, keySuffix: match.keySuffix ?? match.key_suffix ?? null, status: match.keySuffix || match.key_suffix ? 'valid' as const : 'not_set' as const };
              }
              return pk;
            }),
          );
        }
      } catch {
        // API may not exist yet
      }
    })();
  }, []);

  const handleSaveKey = async (providerId: string, key: string) => {
    const res = await fetch(`/api/billing/api-keys/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to save key');
    }
    setProviderKeys((prev) =>
      prev.map((pk) =>
        pk.id === providerId
          ? { ...pk, keySuffix: key.slice(-4), status: 'valid' as const }
          : pk,
      ),
    );
    setAddKeyModal(null);
  };

  const handleRemoveKey = async (providerId: string) => {
    try {
      const res = await fetch(`/api/billing/api-keys/${providerId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
    } catch {
      return;
    }
    setProviderKeys((prev) =>
      prev.map((pk) =>
        pk.id === providerId
          ? { ...pk, keySuffix: null, status: 'not_set' as const }
          : pk,
      ),
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold ide-text">Integrations</h1>
        <p className="ide-text-muted text-sm mt-1">
          Manage your connected services and API keys.
        </p>
      </div>

      {/* ── Integration Cards ────────────────────────── */}
      <section className="space-y-4">
        {INTEGRATIONS.map((integration) => {
          const Icon = integration.icon;
          const comingSoon = integration.status === 'coming_soon';

          return (
            <div
              key={integration.id}
              className={`ide-surface-panel border ide-border rounded-lg p-6 flex items-center justify-between gap-4 transition-colors ${
                comingSoon ? 'opacity-60' : 'ide-hover'
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-10 w-10 rounded-lg ide-surface-input flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 ide-text-muted" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium ide-text">{integration.name}</p>
                  <p className="text-xs ide-text-muted mt-0.5">
                    {integration.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={integration.status} />
                {!comingSoon && integration.actionLabel && (
                  <button className="px-4 py-1.5 text-sm rounded-md border ide-border ide-text ide-hover transition-colors">
                    {integration.actionLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── BYOK API Keys ────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-medium">AI Provider Keys (BYOK)</h2>
          <p className="text-sm ide-text-muted mt-1">
            Use your own API keys to avoid usage limits.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {providerKeys.map((pk) => (
            <div
              key={pk.id}
              className="ide-surface-panel border ide-border rounded-lg p-5 ide-hover transition-colors"
            >
              {/* Provider icon */}
              <div className="h-10 w-10 rounded-lg ide-surface-input flex items-center justify-center mb-4">
                <span className="text-sm font-bold ide-text-muted">
                  {pk.icon}
                </span>
              </div>

              <p className="text-sm font-medium ide-text">{pk.provider}</p>

              <div className="flex items-center gap-2 mt-2">
                {pk.keySuffix ? (
                  <>
                    <span className="text-xs ide-text-muted font-mono">
                      ...{pk.keySuffix}
                    </span>
                    <StatusBadge status={pk.status} />
                  </>
                ) : (
                  <StatusBadge status={pk.status} />
                )}
              </div>

              <div className="mt-4">
                {pk.keySuffix ? (
                  <button
                    onClick={() => handleRemoveKey(pk.id)}
                    className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => setAddKeyModal(pk.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border ide-border ide-text ide-hover transition-colors"
                  >
                    <Key className="h-3.5 w-3.5" />
                    Add Key
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform API Keys ────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-medium">Platform API Keys</h2>
          <p className="text-sm ide-text-muted mt-1">
            Access the Synapse API programmatically.
          </p>
        </div>

        <div className="ide-surface-panel border ide-border rounded-lg p-6">
          {platformKeys.length === 0 ? (
            <div className="text-center py-4">
              <Key className="h-8 w-8 ide-text-quiet mx-auto mb-3" />
              <p className="text-sm ide-text-muted">No API keys yet.</p>
              <button className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border ide-border ide-text ide-hover transition-colors">
                <Plus className="h-4 w-4" />
                New API Key
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {platformKeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between ide-surface-input rounded-lg p-4"
                >
                  <div>
                    <p className="text-sm font-medium ide-text">{pk.name}</p>
                    <p className="text-xs ide-text-muted font-mono mt-0.5">
                      {pk.prefix}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs ide-text-muted">
                      Created {pk.created}
                    </span>
                    <button className="ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button className="ide-text-muted hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border ide-border ide-text ide-hover transition-colors mt-2">
                <Plus className="h-4 w-4" />
                New API Key
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Add Key Modal ─────────────────────────────── */}
      {addKeyModal && (
        <AddKeyModal
          provider={
            providerKeys.find((pk) => pk.id === addKeyModal)?.provider ??
            addKeyModal
          }
          onClose={() => setAddKeyModal(null)}
          onSave={async (key) => handleSaveKey(addKeyModal, key)}
        />
      )}
    </div>
  );
}
