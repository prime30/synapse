'use client';

import { clampConfidence } from '@/lib/agents/confidence-flow';

interface ConfidenceBadgeProps {
  confidence?: number;
  className?: string;
}

/**
 * Visual confidence indicator for agent results.
 * - High (>=0.8): Green accent badge
 * - Medium (0.6-0.79): Amber badge
 * - Low (<0.6): Stone neutral badge
 * Renders nothing if confidence is undefined (graceful degradation).
 */
export function ConfidenceBadge({ confidence: raw, className = '' }: ConfidenceBadgeProps) {
  const confidence = clampConfidence(raw);
  if (confidence === undefined) return null;

  const pct = Math.round(confidence * 100);

  let colorClasses: string;
  if (confidence >= 0.8) {
    colorClasses = 'bg-[oklch(0.745_0.189_148)]/20 text-[oklch(0.745_0.189_148)] dark:text-green-300 border-[oklch(0.745_0.189_148)]/30';
  } else if (confidence >= 0.6) {
    colorClasses = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30';
  } else {
    colorClasses = 'bg-stone-500/20 text-stone-600 dark:text-stone-400 border-stone-500/30';
  }

  return (
    <span
      className={`text-[11px] font-medium px-1.5 py-0.5 rounded border tabular-nums inline-flex items-center gap-1 ${colorClasses} ${className}`}
      title={`Agent confidence: ${pct}%`}
    >
      {pct}%
    </span>
  );
}
