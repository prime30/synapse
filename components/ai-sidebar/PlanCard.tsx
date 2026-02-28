'use client';

import React, { useState, useMemo } from 'react';
import type { PlanStep } from './ChatInterface';
import { ExternalLink, Sparkles } from 'lucide-react';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { clampConfidence } from '@/lib/agents/confidence-flow';

type PlanStatus = 'draft' | 'active' | 'archived';

const STATUS_STYLES: Record<PlanStatus, string> = {
  draft: 'bg-stone-500/10 text-stone-600 dark:text-stone-400',
  active: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  archived: 'bg-stone-400/10 text-stone-400 dark:text-stone-500',
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

interface PlanCardProps {
  planData: { title: string; description: string; steps: PlanStep[]; filePath?: string };
  planId?: string;
  version?: number;
  status?: PlanStatus;
  projectId?: string;
  confidence?: number;
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  onRefine?: (planId: string) => void;
  isBuilding?: boolean;
}

export function PlanCard({
  planData,
  planId,
  version,
  status,
  projectId,
  confidence,
  onOpenPlanFile,
  onBuildPlan,
  onRefine,
  isBuilding,
}: PlanCardProps) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(
    () => new Set(planData.steps.map(s => s.number))
  );

  const toggleStep = (num: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const progress = useMemo(() => {
    const total = planData.steps.length;
    const completed = checkedSteps.size;
    return { completed, total, pct: total > 0 ? (completed / total) * 100 : 0 };
  }, [planData.steps.length, checkedSteps.size]);

  return (
    <div
      className="my-2 rounded-lg border ide-border ide-surface-inset overflow-hidden"
      role="region"
      aria-label="Plan proposal"
    >
      {/* Header: title + status badge */}
      <div className="px-3 py-2 border-b ide-border-subtle">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h4 className="text-xs font-semibold ide-text-1 truncate">{planData.title}</h4>
          {status && (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${STATUS_STYLES[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
          {version != null && (
            <span className="shrink-0 text-[10px] ide-text-muted">v{version}</span>
          )}
          {clampConfidence(confidence) != null && (
            <ConfidenceBadge confidence={confidence} className="shrink-0" />
          )}
        </div>
        <p className="text-[11px] ide-text-2 mt-0.5">{planData.description}</p>

        {/* Progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-stone-200 dark:bg-[#1e1e1e] overflow-hidden">
            <div
              className="h-full rounded-full bg-[oklch(0.745_0.189_148)] transition-all duration-300"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-medium ide-text-muted">
            {progress.completed}/{progress.total}
          </span>
        </div>
      </div>

      {/* Step checkboxes */}
      <div className="px-3 py-2 space-y-1.5">
        {planData.steps.map(step => (
          <label
            key={step.number}
            className="flex items-start gap-2 text-[11px] cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={checkedSteps.has(step.number)}
              onChange={() => toggleStep(step.number)}
              className="mt-0.5 rounded border-stone-300 dark:border-[#333333] text-sky-500 focus:ring-sky-500/50"
              aria-label={`Step ${step.number}: ${step.text ?? step.description}`}
            />
            <span className="flex-1 ide-text-2 group-hover:ide-text-1 transition-colors">
              <span className="font-mono ide-text-muted mr-1">{step.number}.</span>
              {step.text ?? step.description}
              {step.complexity && (
                <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                  step.complexity === 'complex' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  step.complexity === 'moderate' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' :
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {step.complexity}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {/* Footer: actions */}
      <div className="px-3 py-2 border-t ide-border-subtle flex items-center justify-end gap-2">
        {planId && projectId && (
          <a
            href={`/projects/${projectId}/plans/${planId}`}
            className="inline-flex items-center gap-1 ide-text-muted hover:ide-text-2 ide-hover rounded text-xs px-2.5 py-1 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <ExternalLink className="h-3 w-3" />
            Open in tab
          </a>
        )}
        {planId && onRefine && (
          <button
            type="button"
            onClick={() => onRefine(planId)}
            className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 rounded text-xs px-2.5 py-1 focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:outline-none"
          >
            <Sparkles className="h-3 w-3" />
            Refine
          </button>
        )}
        {planData.filePath && onOpenPlanFile && (
          <button
            type="button"
            onClick={() => onOpenPlanFile(planData.filePath!)}
            className="ide-text-muted hover:ide-text-2 ide-hover rounded text-xs px-2.5 py-1 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            View Plan
          </button>
        )}
        {onBuildPlan && (
          <button
            type="button"
            onClick={() => onBuildPlan(checkedSteps)}
            disabled={isBuilding || checkedSteps.size === 0}
            className="bg-accent text-white hover:bg-accent-hover rounded text-xs font-medium px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            {isBuilding ? 'Building...' : `Build (${checkedSteps.size} steps)`}
          </button>
        )}
      </div>
    </div>
  );
}
