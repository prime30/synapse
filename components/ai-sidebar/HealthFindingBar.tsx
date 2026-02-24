'use client';

import { X } from 'lucide-react';
import type { HealthFinding } from '@/lib/ai/theme-health-scanner';

interface HealthFindingBarProps {
  findings: HealthFinding[];
  isScanning: boolean;
  onFix: (prompt: string) => void;
  onDismiss: () => void;
}

const SEVERITY_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  error: {
    bg: 'bg-red-500/10 dark:bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-sky-500/10 dark:bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
};

function getHighestSeverityFinding(findings: HealthFinding[]): HealthFinding | null {
  const order = ['error', 'warning', 'info'] as const;
  for (const sev of order) {
    const f = findings.find((x) => x.severity === sev);
    if (f) return f;
  }
  return findings[0] ?? null;
}

export function HealthFindingBar({
  findings,
  isScanning,
  onFix,
  onDismiss,
}: HealthFindingBarProps) {
  const primary = getHighestSeverityFinding(findings);
  const config = primary ? SEVERITY_CONFIG[primary.severity] ?? SEVERITY_CONFIG.info : null;
  const moreCount = findings.length - 1;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-t border-stone-200 dark:border-white/10 text-xs"
      role="status"
      aria-live="polite"
    >
      {isScanning ? (
        <>
          <span
            className="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse"
            aria-hidden
          />
          <span className="text-stone-700 dark:text-stone-300 flex-1">
            Scanning theme health...
          </span>
        </>
      ) : primary ? (
        <>
          {config && (
            <span
              className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${config.dot}`}
              aria-hidden
            />
          )}
          <span className="text-stone-700 dark:text-stone-300 flex-1 truncate min-w-0">
            {primary.message}
          </span>
          <button
            type="button"
            onClick={() => onFix(primary.fixPrompt)}
            className="flex-shrink-0 bg-[oklch(0.745_0.189_148)] hover:bg-[oklch(0.684_0.178_149)] text-white text-xs px-2 py-1 rounded font-medium transition-colors"
            aria-label="Fix this issue"
          >
            Fix
          </button>
          {moreCount > 0 && (
            <span className="flex-shrink-0 text-stone-500 dark:text-stone-400">
              {moreCount} more
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
