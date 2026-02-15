'use client';

import React, { useState } from 'react';
import type { PlanStep } from './ChatInterface';

interface PlanCardProps {
  planData: { title: string; description: string; steps: PlanStep[]; filePath?: string };
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  isBuilding?: boolean;
}

export function PlanCard({ planData, onOpenPlanFile, onBuildPlan, isBuilding }: PlanCardProps) {
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

  return (
    <div
      className="my-2 rounded-lg border ide-border ide-surface-inset overflow-hidden"
      role="region"
      aria-label="Plan proposal"
    >
      <div className="px-3 py-2 border-b ide-border-subtle">
        <h4 className="text-xs font-semibold ide-text-1">{planData.title}</h4>
        <p className="text-[11px] ide-text-2 mt-0.5">{planData.description}</p>
      </div>

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
              className="mt-0.5 rounded border-stone-300 dark:border-white/20 text-sky-500 focus:ring-sky-500/50"
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

      <div className="px-3 py-2 border-t ide-border-subtle flex items-center justify-end gap-2">
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
