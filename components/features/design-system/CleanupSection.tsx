'use client';

import { useState, useMemo, useCallback } from 'react';
import { useDriftBatch } from '@/hooks/useDriftBatch';
import { LambdaDots } from '@/components/ui/LambdaDots';
import type { DriftResult, TokenizationSuggestion } from '@/lib/design-tokens/drift/types';
import type { TokenChange } from '@/lib/design-tokens/application/types';

interface CleanupSectionProps {
  projectId: string;
}

type Scope = 'all' | 'sections' | 'assets';

/* ── Helpers ───────────────────────────────────────────────────────── */

function scopeToFilePaths(scope: Scope): string[] | undefined {
  // For "all", pass undefined so the API uses all driftable files.
  // For specific scopes, we pass path prefixes that the API will match against.
  if (scope === 'all') return undefined;
  if (scope === 'sections') return undefined; // Will be filtered server-side by extension; send hint
  if (scope === 'assets') return undefined;
  return undefined;
}

function suggestionToChange(s: TokenizationSuggestion): TokenChange {
  return {
    type: 'replace',
    tokenName: s.suggestedToken,
    oldValue: s.hardcodedValue,
    newValue: s.suggestedReplacement,
  };
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'text-emerald-500';
  if (c >= 0.5) return 'text-yellow-500';
  return 'ide-text-muted';
}

/* ── Create Token Inline Form ──────────────────────────────────────── */

interface CreateTokenFormProps {
  projectId: string;
  initialValue: string;
  suggestedName: string;
  suggestedCategory: string;
  onCreated: () => void;
  onCancel: () => void;
}

const CATEGORIES = ['color', 'typography', 'spacing', 'border', 'shadow', 'animation'] as const;

function CreateTokenForm({
  projectId,
  initialValue,
  suggestedName,
  suggestedCategory,
  onCreated,
  onCancel,
}: CreateTokenFormProps) {
  const [name, setName] = useState(suggestedName);
  const [category, setCategory] = useState(suggestedCategory || 'color');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), value: initialValue, category }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setSaving(false);
    }
  }, [projectId, name, initialValue, category, onCreated]);

  return (
    <form onSubmit={handleSubmit} className="mt-2 p-3 rounded-lg ide-surface-panel border ide-border space-y-2">
      <p className="text-xs font-medium ide-text">Create design token from this value</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="token-name"
          className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs rounded-lg ide-surface-input border ide-border-subtle ide-text placeholder:ide-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          required
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg ide-surface-input border ide-border-subtle ide-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="ide-text-muted">Value:</span>
        <code className="font-mono ide-text">{initialValue}</code>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Token'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Impact Modal ──────────────────────────────────────────────────── */

interface ImpactModalProps {
  projectId: string;
  changes: TokenChange[];
  onClose: () => void;
  onApplied: () => void;
}

function ImpactModal({ projectId, changes, onClose, onApplied }: ImpactModalProps) {
  const [impact, setImpact] = useState<{ filesAffected: { filePath: string; instanceCount: number; riskLevel: string }[]; totalInstances: number; riskSummary: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Fetch impact on mount
  useState(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/design-tokens/impact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes }),
        });
        if (!res.ok) throw new Error(`Impact analysis failed (${res.status})`);
        const json = await res.json();
        setImpact(json.data ?? json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to analyze impact');
      } finally {
        setLoading(false);
      }
    })();
  });

  const handleApply = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) throw new Error(`Apply failed (${res.status})`);
      setToast('Changes applied successfully');
      setTimeout(() => {
        onApplied();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  }, [projectId, changes, onApplied, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl ide-surface-pop border ide-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Impact preview"
      >
        <div className="px-6 py-4 border-b ide-border">
          <h3 className="text-base font-semibold ide-text">Impact Preview</h3>
          <p className="text-xs ide-text-muted mt-0.5">{changes.length} change(s) to apply</p>
        </div>

        <div className="px-6 py-4 max-h-80 overflow-y-auto">
          {toast && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-500" role="status" aria-live="polite">
              {toast}
            </div>
          )}
          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 rounded ide-surface-input animate-pulse" />
              ))}
            </div>
          ) : impact ? (
            <div className="space-y-3">
              <p className="text-sm ide-text-2">{impact.riskSummary}</p>
              <p className="text-xs ide-text-muted">
                {impact.totalInstances} instance(s) across {impact.filesAffected.length} file(s)
              </p>
              <div className="divide-y ide-border-subtle border ide-border rounded-lg overflow-hidden">
                {impact.filesAffected.map((f) => (
                  <div key={f.filePath} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-mono ide-text-2 truncate">{f.filePath}</span>
                    <span className="text-xs ide-text-muted flex-shrink-0 ml-2 tabular-nums">
                      {f.instanceCount} instance{f.instanceCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t ide-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || applying || !!toast}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── File group (collapsible) ──────────────────────────────────────── */

interface FileGroupProps {
  projectId: string;
  result: DriftResult;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (filePath: string, keys: string[]) => void;
}

function FileGroup({ projectId, result, selected, onToggle, onToggleAll }: FileGroupProps) {
  const [open, setOpen] = useState(false);
  const [createIdx, setCreateIdx] = useState<number | null>(null);
  const count = result.suggestions.length;

  const allKeys = result.suggestions.map((s, i) => `${result.filePath}::${i}`);
  const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k));

  return (
    <div className="border-b ide-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2 px-4 py-3 ide-hover transition-colors text-left"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          className={`w-3.5 h-3.5 ide-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-sm font-mono ide-text-2 truncate flex-1">{result.filePath}</span>
        <span className="text-xs ide-text-muted flex-shrink-0 tabular-nums">
          {count} suggestion{count !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1">
          {/* Select all in file */}
          <label className="flex items-center gap-2 px-2 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleAll(result.filePath, allKeys)}
              className="rounded ide-border text-accent focus:ring-accent"
            />
            <span className="text-xs ide-text-muted">Select all in file</span>
          </label>

          {result.suggestions.map((s, i) => {
            const key = `${result.filePath}::${i}`;
            return (
              <div key={key}>
                <label
                  className="flex items-start gap-2 px-2 py-2 rounded ide-surface-input cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => onToggle(key)}
                    className="mt-0.5 rounded ide-border text-accent focus:ring-accent"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono ide-text">{s.hardcodedValue}</code>
                      <span className="ide-text-muted text-xs">&rarr;</span>
                      <code className="text-xs font-mono text-accent">{s.suggestedReplacement}</code>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="ide-text-muted">Line {s.lineNumber}</span>
                      <span className={confidenceColor(s.confidence)}>
                        {Math.round(s.confidence * 100)}% confidence
                      </span>
                    </div>
                    {s.reason && (
                      <p className="text-[10px] ide-text-quiet">{s.reason}</p>
                    )}
                    {/* Create token button */}
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setCreateIdx(createIdx === i ? null : i); }}
                        className="text-[10px] px-2 py-0.5 rounded border ide-border-subtle text-accent hover:bg-accent/10 transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        Create Token
                      </button>
                    </div>
                  </div>
                </label>
                {createIdx === i && (
                  <CreateTokenForm
                    projectId={projectId}
                    initialValue={s.hardcodedValue}
                    suggestedName={s.suggestedToken?.replace(/\//g, '-') ?? 'new-token'}
                    suggestedCategory="color"
                    onCreated={() => setCreateIdx(null)}
                    onCancel={() => setCreateIdx(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── AI Suggestion Block ──────────────────────────────────────────── */

interface AISuggestionBlockProps {
  projectId: string;
  driftResults: DriftResult[];
  onApplied: () => void;
}

function AISuggestionBlock({ projectId, driftResults, onApplied }: AISuggestionBlockProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ summary: string; recommendedChanges: TokenChange[]; rationale?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImpact, setShowImpact] = useState(false);

  const handleSuggest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/cleanup-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driftResults }),
      });
      if (!res.ok) throw new Error(`Suggestion failed (${res.status})`);
      const json = await res.json();
      setResult(json.data ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  }, [projectId, driftResults]);

  if (!result) {
    return (
      <div className="p-4 rounded-lg border ide-border ide-surface-panel space-y-3">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <h4 className="text-sm font-semibold ide-text">AI Tokenization Plan</h4>
        </div>
        <p className="text-xs ide-text-2">
          Let AI analyze drift results and suggest which changes to apply.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Suggest Tokenization Plan'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-3">
      {showImpact && (
        <ImpactModal
          projectId={projectId}
          changes={result.recommendedChanges}
          onClose={() => setShowImpact(false)}
          onApplied={onApplied}
        />
      )}

      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
        <h4 className="text-sm font-semibold ide-text">AI Recommendation</h4>
      </div>

      <p className="text-sm ide-text-2">{result.summary}</p>
      {result.rationale && <p className="text-xs ide-text-muted">{result.rationale}</p>}

      {result.recommendedChanges.length > 0 && (
        <div className="border ide-border rounded-lg divide-y ide-border-subtle overflow-hidden">
          {result.recommendedChanges.slice(0, 20).map((ch, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <code className="text-xs font-mono ide-text truncate">{ch.oldValue}</code>
              <span className="ide-text-muted text-xs">&rarr;</span>
              <code className="text-xs font-mono text-accent truncate">{ch.newValue}</code>
              <span className="text-[10px] ide-text-quiet ml-auto flex-shrink-0">{ch.tokenName}</span>
            </div>
          ))}
          {result.recommendedChanges.length > 20 && (
            <div className="px-3 py-2 text-xs ide-text-muted text-center">
              + {result.recommendedChanges.length - 20} more
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowImpact(true)}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
        >
          Preview Impact
        </button>
        <button
          type="button"
          onClick={() => { setResult(null); setError(null); }}
          className="px-3 py-2 text-sm ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ── Main Cleanup Section ──────────────────────────────────────────── */

export function CleanupSection({ projectId }: CleanupSectionProps) {
  const { results, isAnalyzing, error, analyze, clear } = useDriftBatch(projectId);
  const [scope, setScope] = useState<Scope>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImpact, setShowImpact] = useState(false);

  const hasResults = results.length > 0;
  const totalSuggestions = useMemo(
    () => results.reduce((n, r) => n + r.suggestions.length, 0),
    [results],
  );

  const handleAnalyze = useCallback(() => {
    setSelected(new Set());
    const filePaths = scopeToFilePaths(scope);
    analyze(filePaths);
  }, [scope, analyze]);

  const handleToggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((_filePath: string, keys: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allIn = keys.every(k => next.has(k));
      if (allIn) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  }, []);

  // Build TokenChange[] from selected suggestions
  const selectedChanges = useMemo(() => {
    const changes: TokenChange[] = [];
    for (const result of results) {
      result.suggestions.forEach((s, i) => {
        const key = `${result.filePath}::${i}`;
        if (selected.has(key)) {
          changes.push(suggestionToChange(s));
        }
      });
    }
    return changes;
  }, [results, selected]);

  const handleApplied = useCallback(() => {
    clear();
    setSelected(new Set());
  }, [clear]);

  /* ── Empty state (no analysis yet) ───────────────────── */
  if (!hasResults && !isAnalyzing) {
    return (
      <div className="space-y-6">
        {/* Scope selector + Analyze */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="px-3 py-2 text-sm rounded-lg ide-surface-input border ide-border-subtle ide-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All files</option>
            <option value="sections">Sections only</option>
            <option value="assets">Assets only</option>
          </select>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Analyze Theme
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 ide-text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold ide-text mb-1">Run analysis to find suggestions</h3>
          <p className="text-sm ide-text-2 max-w-xs">
            Analyze your theme files to find hardcoded values that can be replaced with design tokens.
          </p>
        </div>
      </div>
    );
  }

  /* ── Analyzing progress ─────────────────────────────── */
  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LambdaDots size={32} className="mb-4" />
        <p className="text-sm ide-text-2">Analyzing theme files…</p>
        <p className="text-xs ide-text-muted mt-1">This may take a moment</p>
      </div>
    );
  }

  /* ── Results ─────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Impact Modal */}
      {showImpact && selectedChanges.length > 0 && (
        <ImpactModal
          projectId={projectId}
          changes={selectedChanges}
          onClose={() => setShowImpact(false)}
          onApplied={handleApplied}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="px-3 py-2 text-sm rounded-lg ide-surface-input border ide-border-subtle ide-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All files</option>
            <option value="sections">Sections only</option>
            <option value="assets">Assets only</option>
          </select>
          <button
            type="button"
            onClick={handleAnalyze}
            className="px-4 py-2 text-sm font-medium ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
          >
            Re-analyze
          </button>
        </div>

        <p className="text-sm ide-text-2">
          {totalSuggestions} suggestion{totalSuggestions !== 1 ? 's' : ''} across {results.length} file{results.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* AI Suggestion Block */}
      <AISuggestionBlock
        projectId={projectId}
        driftResults={results}
        onApplied={handleApplied}
      />

      {/* Drift results grouped by file */}
      {totalSuggestions === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm ide-text-2">No tokenization suggestions found.</p>
          <p className="text-xs ide-text-muted mt-1">Your theme looks clean!</p>
        </div>
      ) : (
        <>
          <div className="border ide-border rounded-lg overflow-hidden">
            {results
              .filter(r => r.suggestions.length > 0)
              .map((r) => (
                <FileGroup
                  key={r.filePath}
                  projectId={projectId}
                  result={r}
                  selected={selected}
                  onToggle={handleToggle}
                  onToggleAll={handleToggleAll}
                />
              ))}
          </div>

          {/* Apply actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowImpact(true)}
                className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
              >
                Preview Impact ({selected.size} selected)
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-3 py-2 text-sm ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
              >
                Clear Selection
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
