'use client';

import React, { useMemo } from 'react';

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface TimelineEntry {
  agentId: string;
  label: string;
  startMs: number;
  endMs?: number;
  phase: 'analyzing' | 'executing' | 'reviewing' | 'complete';
}

export interface OrchestrationTimelineProps {
  entries: TimelineEntry[];
  totalDurationMs?: number;
  className?: string;
}

const PHASE_COLORS: Record<TimelineEntry['phase'], string> = {
  analyzing: 'bg-amber-500',
  executing: 'bg-sky-500',
  reviewing: 'bg-purple-500',
  complete: 'bg-emerald-500',
};

/* ─── Component ────────────────────────────────────────────────────────── */

export function OrchestrationTimeline({
  entries,
  totalDurationMs,
  className = '',
}: OrchestrationTimelineProps) {
  const { minStart, totalDuration, lanes } = useMemo(() => {
    if (entries.length === 0) {
      return { minStart: 0, totalDuration: 0, lanes: [] as { agentId: string; label: string; bars: TimelineEntry[] }[] };
    }

    const minStart = Math.min(...entries.map((e) => e.startMs));
    const maxEnd = Math.max(
      ...entries.map((e) => (e.endMs !== undefined ? e.endMs : e.startMs + 1000))
    );
    const totalDuration = totalDurationMs ?? maxEnd - minStart;

    const byAgent = new Map<string, { label: string; bars: TimelineEntry[] }>();
    for (const e of entries) {
      const existing = byAgent.get(e.agentId);
      if (existing) {
        existing.bars.push(e);
      } else {
        byAgent.set(e.agentId, { label: e.label, bars: [e] });
      }
    }

    const lanes = Array.from(byAgent.entries()).map(([agentId, { label, bars }]) => ({
      agentId,
      label,
      bars,
    }));

    return { minStart, totalDuration, lanes };
  }, [entries, totalDurationMs]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className={
        'rounded-lg border ide-border-subtle p-2 space-y-0.5 ' + (className ? className : '')
      }
    >
      <div className="text-[10px] uppercase tracking-wider ide-text-muted mb-1">
        Orchestration Timeline
      </div>
      {lanes.map((lane) => (
        <div key={lane.agentId} className="flex items-center gap-1 h-4">
          <div className="text-[10px] font-medium w-16 shrink-0 truncate">
            {lane.label}
          </div>
          <div className="flex-1 relative h-3 rounded bg-stone-200/10">
            {lane.bars.map((bar, i) => {
              const endMs = bar.endMs ?? Date.now();
              const leftPct =
                totalDuration > 0
                  ? ((bar.startMs - minStart) / totalDuration) * 100
                  : 0;
              const widthPct =
                totalDuration > 0
                  ? ((endMs - bar.startMs) / totalDuration) * 100
                  : 0;
              const isRunning = bar.endMs === undefined;
              const phaseColor = PHASE_COLORS[bar.phase];
              const pulseClass = isRunning ? ' animate-pulse' : '';

              return (
                <div
                  key={i}
                  className={
                    'absolute h-full rounded top-0 ' +
                    phaseColor +
                    pulseClass
                  }
                  style={{
                    left: leftPct + '%',
                    width: Math.max(widthPct, 2) + '%',
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
