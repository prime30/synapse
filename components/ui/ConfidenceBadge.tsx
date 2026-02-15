'use client';

interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

/**
 * Visual confidence indicator for agent results.
 * - High (>=0.8): Green accent badge, auto-apply safe
 * - Medium (0.6-0.79): Amber badge, "Review suggested"
 * - Low (<0.6): Stone neutral badge, requires explicit approval
 */
export function ConfidenceBadge({ confidence, className = '' }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);

  let colorClasses: string;
  let label: string;

  if (confidence >= 0.8) {
    colorClasses = 'bg-green-500/20 text-green-400 dark:text-green-300 border-green-500/30';
    label = `${pct}% confident`;
  } else if (confidence >= 0.6) {
    colorClasses = 'bg-amber-500/20 text-amber-400 dark:text-amber-300 border-amber-500/30';
    label = `${pct}% — review suggested`;
  } else {
    colorClasses = 'bg-stone-500/20 ide-text-muted border-stone-500/30';
    label = `${pct}% — needs review`;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border tabular-nums ${colorClasses} ${className}`}
      title={`Agent confidence: ${pct}%`}
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {confidence >= 0.8 ? (
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        ) : confidence >= 0.6 ? (
          <path d="M12 9v4m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
        ) : (
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4m0 4h.01" />
        )}
      </svg>
      {label}
    </span>
  );
}
