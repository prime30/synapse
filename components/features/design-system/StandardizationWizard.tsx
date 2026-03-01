'use client';

import { useState, useCallback, useMemo } from 'react';
import type {
  StandardizationAudit,
  ConformAction,
  AdoptAction,
  UnifyAction,
  RemoveAction,
  ApprovedAction,
} from '@/lib/design-tokens/standardization/types';
import type { TokenChange } from '@/lib/design-tokens/application/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildReplacement(tokenName: string, filePath: string): string {
  const isLiquid = filePath.endsWith('.liquid');
  if (isLiquid) {
    const settingName = tokenName.replace(/-/g, '_');
    return `{{ settings.${settingName} }}`;
  }
  const cssName = tokenName.replace(/_/g, '-');
  return `var(--${cssName})`;
}

function approvedToChanges(
  projectId: string,
  audit: StandardizationAudit,
  approved: ApprovedAction[],
): { changes: TokenChange[]; createTokens: Array<{ name: string; value: string; category: string }> } {
  const changes: TokenChange[] = [];
  const createTokens: Array<{ name: string; value: string; category: string }> = [];
  const approvedSet = new Set(approved.map((a) => `${a.type}:${a.id}`));

  for (const a of approved) {
    if (a.type === 'conform') {
      const item = audit.conform.find((c) => c.id === a.id);
      if (item) {
        changes.push({
          type: 'replace',
          tokenName: item.targetToken.name,
          oldValue: item.hardcodedValue,
          newValue: buildReplacement(item.targetToken.name, item.filePath),
        });
      }
    } else if (a.type === 'adopt') {
      const item = audit.adopt.find((c) => c.id === a.id);
      if (item) {
        const name = (a.tokenName ?? item.suggestedName).trim().toLowerCase().replace(/\s+/g, '-');
        const category = a.category ?? item.suggestedCategory;
        createTokens.push({ name, value: item.hardcodedValue, category });
        changes.push({
          type: 'replace',
          tokenName: name,
          oldValue: item.hardcodedValue,
          newValue: buildReplacement(name, item.filePath),
        });
      }
    } else if (a.type === 'unify') {
      const item = audit.unify.find((c) => c.id === a.id);
      if (item) {
        const canonicalValue = a.canonicalValue ?? item.canonicalValue;
        const name = item.suggestedName;
        createTokens.push({
          name: item.suggestedName,
          value: canonicalValue,
          category: 'color',
        });
        for (const v of item.values) {
          changes.push({
            type: 'replace',
            tokenName: name,
            oldValue: v.value,
            newValue: buildReplacement(name, v.filePath),
          });
        }
      }
    } else if (a.type === 'remove') {
      const item = audit.remove.find((c) => c.id === a.id);
      if (item) {
        changes.push({
          type: 'delete',
          tokenName: item.tokenName,
        });
      }
    }
  }

  return { changes, createTokens };
}

const CATEGORIES = ['color', 'typography', 'spacing', 'border', 'shadow', 'animation'] as const;

/* ------------------------------------------------------------------ */
/*  StandardizationWizard                                              */
/* ------------------------------------------------------------------ */

interface StandardizationWizardProps {
  projectId: string;
  onComplete?: () => void;
}

export function StandardizationWizard({ projectId, onComplete }: StandardizationWizardProps) {
  const [audit, setAudit] = useState<StandardizationAudit | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<ApprovedAction[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const toggleApproved = useCallback((action: ApprovedAction) => {
    setApproved((prev) => {
      const key = `${action.type}:${action.id}`;
      const has = prev.some((a) => `${a.type}:${a.id}` === key);
      if (has) return prev.filter((a) => `${a.type}:${a.id}` !== key);
      return [...prev, action];
    });
  }, []);

  const isApproved = useCallback(
    (type: string, id: string) => approved.some((a) => a.type === type && a.id === id),
    [approved],
  );

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setAudit(null);
    setApproved([]);

    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/standardize`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Standardize failed (${res.status})`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalAudit: StandardizationAudit | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const json = line.slice(6);
              if (json === '[DONE]') continue;
              try {
                const event = JSON.parse(json) as { type: string; data?: StandardizationAudit; message?: string };
                if (event.type === 'complete' && event.data) {
                  finalAudit = event.data;
                } else if (event.type === 'error') {
                  throw new Error(event.message ?? 'Standardization failed');
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        }
      }

      if (buffer) {
        const last = buffer.split('\n').find((l) => l.startsWith('data: '));
        if (last) {
          try {
            const event = JSON.parse(last.slice(6)) as { type: string; data?: StandardizationAudit };
            if (event.type === 'complete' && event.data) finalAudit = event.data;
          } catch {
            /* ignore */
          }
        }
      }

      setAudit(finalAudit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Standardization failed');
    } finally {
      setIsRunning(false);
    }
  }, [projectId]);

  const handleApply = useCallback(async () => {
    if (!audit || approved.length === 0) return;
    setIsApplying(true);
    setApplyError(null);

    try {
      const { changes, createTokens } = approvedToChanges(projectId, audit, approved);

      const seenTokens = new Set<string>();
      for (const ct of createTokens) {
        const key = `${ct.name}:${ct.value}:${ct.category}`;
        if (seenTokens.has(key)) continue;
        seenTokens.add(key);
        const createRes = await fetch(`/api/projects/${projectId}/design-tokens/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ct),
        });
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Create token failed (${createRes.status})`);
        }
      }

      const replaceChanges = changes.filter((c) => c.type === 'replace' || c.type === 'delete');
      if (replaceChanges.length > 0) {
        const applyRes = await fetch(`/api/projects/${projectId}/design-tokens/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: replaceChanges }),
        });
        if (!applyRes.ok) {
          const body = await applyRes.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Apply failed (${applyRes.status})`);
        }
      }

      setAudit(null);
      setApproved([]);
      onComplete?.();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setIsApplying(false);
    }
  }, [projectId, audit, approved, onComplete]);

  const conformByToken = useMemo(() => {
    if (!audit) return new Map<string, ConformAction[]>();
    const map = new Map<string, ConformAction[]>();
    for (const c of audit.conform) {
      const key = c.targetToken.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [audit]);

  const hasAny = audit && (
    audit.conform.length > 0 ||
    audit.adopt.length > 0 ||
    audit.unify.length > 0 ||
    audit.remove.length > 0
  );

  /* ── Empty / run state ───────────────────────────────────────── */
  if (!audit && !isRunning) {
    return (
      <div className="space-y-4">
        <p className="text-sm ide-text-2">
          Scan your theme for hardcoded values and get suggestions to conform, adopt, unify, or remove tokens.
        </p>
        {error && <p className="text-sm text-red-400 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={runAudit}
          disabled={isRunning}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          Run Standardization Audit
        </button>
      </div>
    );
  }

  /* ── Running ─────────────────────────────────────────────────── */
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm ide-text-2">Scanning and classifying…</p>
      </div>
    );
  }

  /* ── No actions ───────────────────────────────────────────────── */
  if (audit && !hasAny) {
    return (
      <div className="space-y-4">
        <p className="text-sm ide-text-2">
          No standardization actions found. Your theme looks clean!
        </p>
        <p className="text-xs ide-text-muted">
          {audit.stats.totalFilesScanned} files scanned, {audit.stats.totalValuesFound} values found.
        </p>
        <button
          type="button"
          onClick={runAudit}
          className="px-4 py-2 text-sm font-medium ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
        >
          Re-run Audit
        </button>
      </div>
    );
  }

  /* ── Results ────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {applyError && (
        <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 dark:text-red-400">
          {applyError}
        </div>
      )}

      {/* Conform — grouped by target token */}
      {audit && audit.conform.length > 0 && (
        <section className="rounded-lg border ide-border ide-surface-panel overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold ide-text border-b ide-border">
            Conform ({audit.conform.length})
          </h3>
          <div className="divide-y ide-border-subtle">
            {Array.from(conformByToken.entries()).map(([tokenName, items]) => (
              <div key={tokenName} className="px-4 py-2">
                <p className="text-xs font-medium ide-text-muted mb-2">→ {tokenName}</p>
                {items.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 py-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isApproved('conform', c.id)}
                      onChange={() => toggleApproved({ type: 'conform', id: c.id })}
                      className="rounded ide-border text-accent focus:ring-accent"
                    />
                    <code className="text-xs font-mono ide-text">{c.hardcodedValue}</code>
                    <span className="text-xs ide-text-muted">
                      {c.filePath}:{c.line}
                    </span>
                    <span className="text-[10px] ide-text-quiet">
                      {Math.round(c.confidence * 100)}%
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Adopt */}
      {audit && audit.adopt.length > 0 && (
        <section className="rounded-lg border ide-border ide-surface-panel overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold ide-text border-b ide-border">
            Adopt ({audit.adopt.length})
          </h3>
          <div className="divide-y ide-border-subtle">
            {audit.adopt.map((a) => (
              <AdoptRow
                key={a.id}
                item={a}
                isApproved={isApproved('adopt', a.id)}
                onToggle={() => toggleApproved({ type: 'adopt', id: a.id })}
                onApprovedChange={(upd) =>
                  setApproved((prev) =>
                    prev.map((x) =>
                      x.type === 'adopt' && x.id === a.id
                        ? { ...x, tokenName: upd.name, category: upd.category }
                        : x,
                    ),
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Unify */}
      {audit && audit.unify.length > 0 && (
        <section className="rounded-lg border ide-border ide-surface-panel overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold ide-text border-b ide-border">
            Unify ({audit.unify.length})
          </h3>
          <div className="divide-y ide-border-subtle">
            {audit.unify.map((u) => (
              <UnifyRow
                key={u.id}
                item={u}
                isApproved={isApproved('unify', u.id)}
                onToggle={() => toggleApproved({ type: 'unify', id: u.id, canonicalValue: u.canonicalValue })}
                onCanonicalChange={(val) =>
                  setApproved((prev) =>
                    prev.map((x) =>
                      x.type === 'unify' && x.id === u.id ? { ...x, canonicalValue: val } : x,
                    ),
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Remove */}
      {audit && audit.remove.length > 0 && (
        <section className="rounded-lg border ide-border ide-surface-panel overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-semibold ide-text border-b ide-border">
            Remove ({audit.remove.length})
          </h3>
          <div className="divide-y ide-border-subtle">
            {audit.remove.map((r) => (
              <label key={r.id} className="flex items-center gap-2 px-4 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isApproved('remove', r.id)}
                  onChange={() => toggleApproved({ type: 'remove', id: r.id })}
                  className="rounded ide-border text-accent focus:ring-accent"
                />
                <code className="text-xs font-mono ide-text">{r.tokenName}</code>
                <span className="text-xs ide-text-muted">= {r.tokenValue}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Apply */}
      {approved.length > 0 && (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isApplying ? 'Applying…' : `Apply ${approved.length} approved change${approved.length !== 1 ? 's' : ''}`}
          </button>
          <button
            type="button"
            onClick={() => setApproved([])}
            className="px-3 py-2 text-sm ide-text-2 border ide-border rounded-lg hover:ide-text transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={runAudit}
        className="text-xs ide-text-muted hover:ide-text-2 transition-colors"
      >
        Re-run audit
      </button>
    </div>
  );
}

/* ── Adopt row with editable name/category ───────────────────────── */

function AdoptRow({
  item,
  isApproved,
  onToggle,
  onApprovedChange,
}: {
  item: AdoptAction;
  isApproved: boolean;
  onToggle: () => void;
  onApprovedChange: (upd: { name: string; category: string }) => void;
}) {
  const [name, setName] = useState(item.suggestedName);
  const [category, setCategory] = useState(item.suggestedCategory);

  const handleBlur = () => onApprovedChange({ name, category });

  return (
    <div className="px-4 py-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isApproved}
          onChange={onToggle}
          className="mt-1 rounded ide-border text-accent focus:ring-accent"
        />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono ide-text">{item.hardcodedValue}</code>
            <span className="text-xs ide-text-muted">{item.filePath}:{item.line}</span>
            <span className="text-[10px] ide-text-quiet">{item.fileCount} occurrence(s)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleBlur}
              placeholder="token-name"
              className="flex-1 min-w-[120px] px-2 py-1 text-xs rounded ide-surface-input border ide-border-subtle ide-text placeholder:ide-text-muted"
            />
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                onApprovedChange({ name, category: e.target.value });
              }}
              onBlur={handleBlur}
              className="px-2 py-1 text-xs rounded ide-surface-input border ide-border-subtle ide-text"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </label>
    </div>
  );
}

/* ── Unify row with canonical value picker ───────────────────────── */

function UnifyRow({
  item,
  isApproved,
  onToggle,
  onCanonicalChange,
}: {
  item: UnifyAction;
  isApproved: boolean;
  onToggle: () => void;
  onCanonicalChange: (val: string) => void;
}) {
  return (
    <div className="px-4 py-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isApproved}
          onChange={onToggle}
          className="mt-1 rounded ide-border text-accent focus:ring-accent"
        />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs ide-text-muted">Unify {item.values.length} similar values → {item.suggestedName}</p>
          <select
            onChange={(e) => onCanonicalChange(e.target.value)}
            className="px-2 py-1 text-xs rounded ide-surface-input border ide-border-subtle ide-text"
            defaultValue={item.canonicalValue}
          >
            {item.values.map((v) => (
              <option key={`${v.filePath}:${v.line}`} value={v.value}>
                {v.value} ({v.filePath}:{v.line})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1 mt-1">
            {item.values.map((v) => (
              <span key={`${v.filePath}:${v.line}`} className="text-[10px] ide-text-quiet">
                {v.value}
              </span>
            ))}
          </div>
        </div>
      </label>
    </div>
  );
}
