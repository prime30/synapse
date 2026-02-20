'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { ContextMeterState, ContextStatus } from '@/hooks/useContextMeter';
import { AGENT_BADGE_COLORS, formatAgentLabel } from '@/lib/agents/agent-colors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const STATUS_COLORS: Record<ContextStatus, { ring: string; text: string; bg: string }> = {
  ok: { ring: 'stroke-sky-500 dark:stroke-sky-400', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/20' },
  warning: { ring: 'stroke-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/20' },
  critical: { ring: 'stroke-red-400', text: 'text-red-400', bg: 'bg-red-500/20' },
};

const STATUS_BAR_COLORS: Record<ContextStatus, string> = {
  ok: 'bg-sky-500 dark:bg-sky-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

// ---------------------------------------------------------------------------
// Mini ring SVG (18x18)
// ---------------------------------------------------------------------------

function MiniRing({ percentage, status }: { percentage: number; status: ContextStatus }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  return (
    <svg width={18} height={18} viewBox="0 0 18 18" className="shrink-0">
      <circle
        cx={9}
        cy={9}
        r={radius}
        fill="none"
        strokeWidth={2.5}
        className="stroke-stone-200 dark:stroke-white/10"
      />
      <circle
        cx={9}
        cy={9}
        r={radius}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`${STATUS_COLORS[status].ring} transition-all duration-300`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Breakdown row
// ---------------------------------------------------------------------------

function BreakdownRow({ label, tokens, maxTokens }: { label: string; tokens: number; maxTokens: number }) {
  const pct = maxTokens > 0 ? (tokens / maxTokens) * 100 : 0;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="ide-text-3">{label}</span>
      <span className="ide-text-2 tabular-nums">{formatTokens(tokens)} <span className="ide-text-quiet">({pct.toFixed(1)}%)</span></span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-agent breakdown (D3)
// ---------------------------------------------------------------------------

// AGENT_BADGE_COLORS imported from @/lib/agents/agent-colors

function AgentBreakdown({ agents }: { agents: Array<{ agentType: string; inputTokens: number; outputTokens: number }> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t ide-border-subtle pt-2 space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-[11px] ide-text-3 hover:ide-text-2 transition-colors w-full"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
        Agent Breakdown
        <span className="ide-text-quiet ml-auto tabular-nums">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
      </button>
      {expanded && (
        <div className="space-y-1 pl-3">
          {agents.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${AGENT_BADGE_COLORS[a.agentType] ?? 'ide-surface-inset ide-text-muted'}`}>
                {formatAgentLabel(a.agentType)}
              </span>
              <span className="ide-text-2 tabular-nums">
                {formatTokens(a.inputTokens)} in / {formatTokens(a.outputTokens)} out
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContextMeter
// ---------------------------------------------------------------------------

interface ContextMeterProps {
  meter: ContextMeterState;
  /** Model label to display in popover (e.g. "Sonnet 4") */
  modelLabel?: string;
  /** Callback to start a new chat (for freeing context). */
  onNewChat?: () => void;
}

export function ContextMeter({ meter, modelLabel, onNewChat }: ContextMeterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  const colors = STATUS_COLORS[meter.status];
  const barColor = STATUS_BAR_COLORS[meter.status];

  return (
    <div ref={containerRef} className="relative">
      {/* Compact pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center gap-1.5 h-9 min-h-9 min-w-[2.5rem] rounded-lg px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none bg-transparent ${colors.text} hover:brightness-125`}
        title="Context window usage"
        aria-label={`Context window ${Math.round(meter.percentage)}% used`}
      >
        <MiniRing percentage={meter.percentage} status={meter.status} />
        <span className="tabular-nums">{Math.round(meter.percentage)}%</span>
      </button>

      {/* Expanded popover */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border ide-border ide-surface-pop shadow-xl z-50 p-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium ide-text">Context Window</span>
            {modelLabel && (
              <span className="text-[10px] ide-text-muted">{modelLabel}</span>
            )}
          </div>

          {/* Large bar */}
          <div>
            <div className="h-2 rounded-full bg-stone-200 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-300`}
                style={{ width: `${Math.min(meter.percentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs font-medium tabular-nums ${colors.text}`}>
                {formatTokens(meter.usedTokens)}
              </span>
              <span className="text-[10px] ide-text-muted tabular-nums">
                / {formatTokens(meter.maxTokens)}
              </span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-1 border-t ide-border-subtle pt-2">
            {meter.breakdown.summarizedMessages != null && meter.breakdown.summarizedMessages > 0 ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="ide-text-3">Messages</span>
                <span className="ide-text-2 tabular-nums">
                  {formatTokens(meter.breakdown.messages)} <span className="ide-text-quiet">({meter.breakdown.summarizedMessages} summarized)</span>
                </span>
              </div>
            ) : (
              <BreakdownRow label="Messages" tokens={meter.breakdown.messages} maxTokens={meter.maxTokens} />
            )}
            <BreakdownRow label="Files" tokens={meter.breakdown.fileContext} maxTokens={meter.maxTokens} />
            {meter.breakdown.totalFiles != null && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="ide-text-3">Files in context</span>
                <span className="ide-text-2 tabular-nums">
                  {meter.breakdown.includedFiles ?? 0} of {meter.breakdown.totalFiles}
                </span>
              </div>
            )}
            <BreakdownRow label="System" tokens={meter.breakdown.systemPrompt} maxTokens={meter.maxTokens} />
            {meter.breakdown.selection > 0 && (
              <BreakdownRow label="Selection" tokens={meter.breakdown.selection} maxTokens={meter.maxTokens} />
            )}
          </div>

          {/* Per-agent breakdown */}
          {meter.breakdown.perAgentUsage && meter.breakdown.perAgentUsage.length > 0 && (
            <AgentBreakdown agents={meter.breakdown.perAgentUsage} />
          )}

          {/* Budget truncation warning */}
          {meter.breakdown.budgetTruncated && (
            <div className="border-t ide-border-subtle pt-2">
              <p className="text-[10px] text-amber-400">
                Context budget enforced. Some content was truncated to fit the limit.
              </p>
            </div>
          )}

          {/* Warning / Critical with action */}
          {meter.status === 'critical' && (
            <div className="border-t ide-border-subtle pt-2 space-y-1.5">
              <p className="text-[10px] text-red-400">
                Approaching context limit. Start a new chat to free up space.
              </p>
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => { onNewChat(); setOpen(false); }}
                  className="w-full rounded px-2 py-1 text-[10px] font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 transition-colors"
                  aria-label="Start a new chat to free context"
                >
                  New chat
                </button>
              )}
            </div>
          )}
          {meter.status === 'warning' && (
            <div className="border-t ide-border-subtle pt-2 space-y-1.5">
              <p className="text-[10px] text-amber-400">
                Context window filling up. Responses may start losing earlier context.
              </p>
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => { onNewChat(); setOpen(false); }}
                  className="w-full rounded px-2 py-1 text-[10px] font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 transition-colors"
                  aria-label="Start a new chat to free context"
                >
                  New chat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
