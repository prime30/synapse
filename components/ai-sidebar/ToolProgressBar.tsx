'use client';

interface ToolProgressBarProps {
  percentage?: number;
  indeterminate?: boolean;
}

export function ToolProgressBar({ percentage, indeterminate }: ToolProgressBarProps) {
  return (
    <div
      className="h-0.5 w-full rounded-full overflow-hidden bg-stone-200 dark:bg-white/10"
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : percentage}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-label={indeterminate ? 'Progress' : undefined}
    >
      <div
        className={`h-full bg-sky-400 dark:bg-sky-500 transition-all duration-300 ease-out ${
          indeterminate ? 'w-2/3 animate-indeterminate-slide' : ''
        }`}
        style={!indeterminate && percentage != null ? { width: `${Math.min(100, Math.max(0, percentage))}%` } : undefined}
      />
    </div>
  );
}
