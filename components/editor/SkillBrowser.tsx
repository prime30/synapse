'use client';

import { useState, useEffect } from 'react';

interface ModuleWithEffectiveness {
  id: string;
  effectivenessScore: number | null;
}

interface UnmatchedRequest {
  userMessage: string;
  toolCallsUsed: number;
  hadClarification: boolean;
  suggestedModule: string;
  suggestedKeywords: string[];
}

interface GapsResponse {
  modules: ModuleWithEffectiveness[];
  unmatchedRequests: UnmatchedRequest[];
  lowEffectivenessModules: Array<{
    moduleId: string;
    loadCount: number;
    negativeFeeback: number;
    effectivenessScore: number;
  }>;
  suggestions: string[];
}

export interface SkillBrowserProps {
  projectId: string;
}

function effectivenessColor(score: number | null): string {
  if (score === null) return 'ide-text-muted';
  if (score > 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function effectivenessLabel(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}%`;
}

export function SkillBrowser({ projectId }: SkillBrowserProps) {
  const [data, setData] = useState<GapsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchGaps() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/projects/${projectId}/skills/gaps`);
        if (!res.ok) throw new Error('Failed to load skills');
        const json = await res.json();
        if (!cancelled && json.data) setData(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGaps();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-5 h-5 border-2 ide-border border-t-sky-500 rounded-full animate-spin mb-3" />
        <p className="text-xs ide-text-muted">Loading knowledge modules…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const modules = data?.modules ?? [];
  const unmatchedRequests = data?.unmatchedRequests ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold ide-text-2 uppercase tracking-wider">
            Knowledge Modules
          </h3>
          {unmatchedRequests.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGaps((p) => !p)}
              className="text-[10px] px-2 py-1 rounded ide-surface-input border ide-border ide-text-muted hover:ide-text-2 hover:border-stone-400 dark:hover:border-white/20 transition-colors"
            >
              View Gaps ({unmatchedRequests.length})
            </button>
          )}
        </div>
      </div>

      {/* Module table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b ide-border-subtle">
              <th className="text-left px-3 py-2 font-medium ide-text-2">Module</th>
              <th className="text-left px-3 py-2 font-medium ide-text-2">Effectiveness</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id} className="border-b ide-border-subtle last:border-b-0 ide-hover">
                <td className="px-3 py-2 font-mono ide-text-2 truncate max-w-[140px]" title={m.id}>
                  {m.id}
                </td>
                <td className={`px-3 py-2 tabular-nums ${effectivenessColor(m.effectivenessScore)}`}>
                  {effectivenessLabel(m.effectivenessScore)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* View Gaps panel */}
      {showGaps && unmatchedRequests.length > 0 && (
        <div className="flex-shrink-0 border-t ide-border-subtle max-h-48 overflow-y-auto">
          <div className="px-3 py-2">
            <h4 className="text-[10px] font-medium ide-text-2 uppercase tracking-wider mb-2">
              Unmatched requests ({unmatchedRequests.length})
            </h4>
            <ul className="space-y-2">
              {unmatchedRequests.slice(0, 10).map((req, i) => (
                <li key={i} className="text-[11px] ide-text-muted">
                  <span className="ide-text-2 truncate block">{req.userMessage}</span>
                  <span className="text-[10px]">
                    {req.toolCallsUsed} tools • suggested: {req.suggestedModule}
                  </span>
                </li>
              ))}
            </ul>
            {unmatchedRequests.length > 10 && (
              <p className="text-[10px] ide-text-quiet mt-2">
                +{unmatchedRequests.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
