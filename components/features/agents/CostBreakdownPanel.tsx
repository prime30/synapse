'use client';

import { useState, useMemo } from 'react';

export interface CostEntry {
  id: string;
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  agentType?: string;
  request?: string;
}

interface CostBreakdownPanelProps {
  entries: CostEntry[];
  sessionTotal: number;
  className?: string;
}

const AGENT_COLORS: Record<string, string> = {
  project_manager: 'text-purple-400',
  liquid: 'text-amber-400',
  css: 'text-sky-400',
  javascript: 'text-yellow-400',
  json: 'text-emerald-400',
  review: 'text-rose-400',
};

function formatCost(cents: number): string {
  if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function CostBreakdownPanel({ entries, sessionTotal, className = '' }: CostBreakdownPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const perModel = useMemo(() => {
    const map = new Map<string, { costCents: number; inputTokens: number; outputTokens: number; count: number }>();
    for (const e of entries) {
      const existing = map.get(e.model) ?? { costCents: 0, inputTokens: 0, outputTokens: 0, count: 0 };
      existing.costCents += e.costCents;
      existing.inputTokens += e.inputTokens;
      existing.outputTokens += e.outputTokens;
      existing.count++;
      map.set(e.model, existing);
    }
    return [...map.entries()].sort((a, b) => b[1].costCents - a[1].costCents);
  }, [entries]);

  const perAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.agentType) {
        map.set(e.agentType, (map.get(e.agentType) ?? 0) + e.costCents);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  return (
    <div className={`ide-surface-panel border ide-border rounded-lg p-3 space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium ide-text">Session Cost</span>
        <span className="text-sm font-medium text-emerald-400 tabular-nums">
          {formatCost(sessionTotal)}
        </span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 text-[11px] ide-text-muted">
        <span>{entries.length} request{entries.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{formatTokens(entries.reduce((s, e) => s + e.inputTokens, 0))} in</span>
        <span>·</span>
        <span>{formatTokens(entries.reduce((s, e) => s + e.outputTokens, 0))} out</span>
      </div>

      {/* Per-model breakdown */}
      {perModel.length > 0 && (
        <div className="space-y-1 border-t ide-border-subtle pt-2">
          <span className="text-[10px] ide-text-muted uppercase tracking-wider">By Model</span>
          {perModel.map(([model, stats]) => (
            <div key={model} className="flex items-center justify-between text-[11px]">
              <span className="ide-text-3 truncate max-w-[140px]" title={model}>
                {model.replace(/^claude-|^gpt-|^gemini-/, '')}
              </span>
              <span className="ide-text-2 tabular-nums">{formatCost(stats.costCents)} ({stats.count}×)</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-agent breakdown */}
      {perAgent.length > 0 && (
        <div className="space-y-1 border-t ide-border-subtle pt-2">
          <span className="text-[10px] ide-text-muted uppercase tracking-wider">By Agent</span>
          {perAgent.map(([agent, cost]) => (
            <div key={agent} className="flex items-center justify-between text-[11px]">
              <span className={AGENT_COLORS[agent] ?? 'ide-text-3'}>
                {agent.replace('_', ' ')}
              </span>
              <span className="ide-text-2 tabular-nums">{formatCost(cost)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent requests (expandable) */}
      <div className="border-t ide-border-subtle pt-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[11px] ide-text-3 hover:ide-text-2 transition-colors w-full"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
          Recent Requests
        </button>
        {expanded && (
          <div className="space-y-1 mt-1 pl-3 max-h-40 overflow-y-auto">
            {entries.slice(0, 20).map(e => (
              <div key={e.id} className="flex items-center justify-between text-[10px] py-0.5">
                <span className="ide-text-muted truncate max-w-[140px]" title={e.request}>
                  {e.request?.slice(0, 30) ?? 'Request'}
                </span>
                <span className="ide-text-quiet tabular-nums">{formatCost(e.costCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
