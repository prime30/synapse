'use client';

import { useCallback } from 'react';
import { Braces, Variable, Zap, Palette, Timer, Accessibility, Lightbulb, X, type LucideIcon } from 'lucide-react';
import type { AmbientNudge } from '@/hooks/useAmbientIntelligence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AmbientBarProps {
  /** The highest-confidence nudge to display. */
  nudge: AmbientNudge | null;
  /** Called when user clicks "Yes" / the action button. */
  onAccept: (nudgeId: string) => void;
  /** Called when user clicks "X" to dismiss. */
  onDismiss: (nudgeId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Signal type icons & colors
// ---------------------------------------------------------------------------

const SIGNAL_CONFIG: Record<
  string,
  { icon: LucideIcon; bgClass: string; textClass: string; borderClass: string }
> = {
  'missing-schema': {
    icon: Braces,
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/20',
  },
  'unused-variable': {
    icon: Variable,
    bgClass: 'bg-yellow-500/10',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-500/20',
  },
  'broken-reference': {
    icon: Zap,
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/20',
  },
  'style-inconsistency': {
    icon: Palette,
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/20',
  },
  'performance-issue': {
    icon: Timer,
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/20',
  },
  'accessibility-gap': {
    icon: Accessibility,
    bgClass: 'bg-sky-500/10 dark:bg-sky-500/10',
    textClass: 'text-sky-600 dark:text-sky-400',
    borderClass: 'border-sky-500/20 dark:border-sky-500/20',
  },
};

const DEFAULT_CONFIG = {
  icon: Lightbulb,
  bgClass: 'ide-surface-inset',
  textClass: 'ide-text-muted',
  borderClass: 'ide-border-subtle border',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AmbientBar — non-intrusive strip below chat showing the highest-confidence
 * proactive nudge. Shows action label for one-click resolution and "X" to dismiss.
 *
 * Uses CSS transitions on max-height/opacity for smooth enter/exit.
 */
export function AmbientBar({ nudge, onAccept, onDismiss, className = '' }: AmbientBarProps) {
  const handleAccept = useCallback(() => {
    if (nudge) {
      onAccept(nudge.id);
    }
  }, [nudge, onAccept]);

  const handleDismiss = useCallback(() => {
    if (nudge) {
      onDismiss(nudge.id);
    }
  }, [nudge, onDismiss]);

  const config = nudge
    ? (SIGNAL_CONFIG[nudge.signalType] ?? DEFAULT_CONFIG)
    : DEFAULT_CONFIG;

  return (
    <div
      className={`
        flex-shrink-0 overflow-hidden transition-all duration-200 ease-out
        ${nudge ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}
        ${className}
      `}
      role="status"
      aria-live="polite"
      aria-label="AI suggestion"
    >
      {nudge && (
        <div
          className={`
            flex items-center gap-2 px-3 py-1.5 mx-2 mb-2 rounded-md border
            ${config.bgClass} ${config.borderClass}
          `}
        >
          {/* Signal icon */}
          <config.icon
            className={`flex-shrink-0 h-3.5 w-3.5 ${config.textClass}`}
            aria-hidden="true"
          />

          {/* Message */}
          <span className="flex-1 text-xs ide-text-2 truncate min-w-0">
            {nudge.message}
          </span>

          {/* Accept button */}
          <button
            type="button"
            onClick={handleAccept}
            className={`
              flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium
              transition-colors duration-150
              ${config.textClass} hover:bg-white/10
              border ${config.borderClass}
            `}
            aria-label={nudge.actionLabel}
          >
            {nudge.actionLabel}
          </button>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 rounded p-0.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors duration-150"
            aria-label="Dismiss suggestion"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
