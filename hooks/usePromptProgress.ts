'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptProgressState {
  /** 0-100, never reaches 100 until complete */
  progress: number;
  /** Estimated seconds remaining (null if no estimate available) */
  secondsRemaining: number | null;
  /** Estimated total seconds for this action */
  estimatedTotal: number | null;
  /** Elapsed seconds since loading started */
  elapsed: number;
  /** Whether we're actively tracking */
  isTracking: boolean;
}

interface ActionHistory {
  /** Exponentially weighted moving average of duration in ms */
  avgMs: number;
  /** Number of samples */
  count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'synapse-prompt-timings';
const TICK_INTERVAL = 100; // ms between updates
const SMOOTHING_FACTOR = 0.3; // EMA alpha (higher = more weight on recent)

/** Default estimates (ms) per action when no history exists. */
const DEFAULT_ESTIMATES: Record<string, number> = {
  analyze: 8_000,
  generate: 15_000,
  review: 12_000,
  fix: 10_000,
  explain: 8_000,
  refactor: 12_000,
  document: 10_000,
  plan: 12_000,
  summary: 5_000,
  chat: 10_000,
};

/** Fallback estimates by intent mode (used when no history for the specific action). */
const INTENT_MODE_ESTIMATES: Record<string, number> = {
  code: 45_000,
  ask: 20_000,
  plan: 15_000,
  debug: 30_000,
};
const FALLBACK_ESTIMATE = 10_000;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadHistory(): Record<string, ActionHistory> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ActionHistory>) : {};
  } catch {
    return {};
  }
}

function saveHistory(history: Record<string, ActionHistory>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

// ---------------------------------------------------------------------------
// Easing: progress curve that decelerates as it approaches the estimate,
// and asymptotically approaches 95% if the estimate is exceeded.
//
// The idea: move quickly early on, slow down near 80%, and if we exceed the
// estimate just crawl toward 95% so the bar is never "stuck at 100%".
// ---------------------------------------------------------------------------

function computeProgress(elapsedMs: number, estimateMs: number): number {
  if (estimateMs <= 0) return 0;

  const ratio = elapsedMs / estimateMs;

  if (ratio <= 1) {
    // Under estimate: ease-out curve that reaches ~90% at ratio=1
    // Using 1 - (1-t)^2 scaled to 90
    return 90 * (1 - Math.pow(1 - ratio, 2));
  }

  // Over estimate: asymptotically approach 95%
  // 90 + 5 * (1 - e^(-k*(ratio-1)))  where k controls how fast we approach 95
  const overshoot = ratio - 1;
  return 90 + 5 * (1 - Math.exp(-0.5 * overshoot));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Tracks AI prompt progress with estimated countdown.
 *
 * - Pass `isLoading=true` when a prompt starts, `false` when it completes.
 * - Pass `action` (e.g. 'generate', 'review') for action-specific estimates.
 * - On completion the actual duration is recorded to improve future estimates.
 *
 * Returns a `PromptProgressState` updated every 100ms during loading.
 */
export function usePromptProgress(
  isLoading: boolean,
  action?: string,
  intentMode?: string,
): PromptProgressState {
  const [state, setState] = useState<PromptProgressState>({
    progress: 0,
    secondsRemaining: null,
    estimatedTotal: null,
    elapsed: 0,
    isTracking: false,
  });

  const startTimeRef = useRef<number>(0);
  const actionRef = useRef<string | undefined>(action);
  const historyRef = useRef<Record<string, ActionHistory>>(loadHistory());
  const wasLoadingRef = useRef(false);

  // Keep action ref in sync
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  // Get estimate for the current action (falls back to intent mode, then default)
  const getEstimateMs = useCallback((act?: string, intent?: string): number => {
    const key = act ?? 'chat';
    const hist = historyRef.current[key];
    if (hist && hist.count > 0) return hist.avgMs;
    if (DEFAULT_ESTIMATES[key]) return DEFAULT_ESTIMATES[key];
    if (intent && INTENT_MODE_ESTIMATES[intent]) return INTENT_MODE_ESTIMATES[intent];
    return FALLBACK_ESTIMATE;
  }, []);

  // Record a completed prompt's duration
  const recordDuration = useCallback((act: string | undefined, durationMs: number) => {
    const key = act ?? 'chat';
    const history = historyRef.current;
    const existing = history[key];

    if (existing && existing.count > 0) {
      // EMA update
      history[key] = {
        avgMs: existing.avgMs * (1 - SMOOTHING_FACTOR) + durationMs * SMOOTHING_FACTOR,
        count: existing.count + 1,
      };
    } else {
      history[key] = { avgMs: durationMs, count: 1 };
    }

    historyRef.current = history;
    saveHistory(history);
  }, []);

  useEffect(() => {
    // Transition: not loading -> loading (start tracking)
    if (isLoading && !wasLoadingRef.current) {
      startTimeRef.current = Date.now();
      const estimateMs = getEstimateMs(action, intentMode);

      setState({
        progress: 0,
        secondsRemaining: Math.ceil(estimateMs / 1000),
        estimatedTotal: Math.round(estimateMs / 1000),
        elapsed: 0,
        isTracking: true,
      });
    }

    // Transition: loading -> not loading (complete, record timing)
    if (!isLoading && wasLoadingRef.current) {
      const durationMs = Date.now() - startTimeRef.current;
      if (durationMs > 500) {
        // Only record meaningful durations (ignore sub-500ms flashes)
        recordDuration(actionRef.current, durationMs);
      }

      setState({
        progress: 100,
        secondsRemaining: 0,
        estimatedTotal: null,
        elapsed: Math.round(durationMs / 1000),
        isTracking: false,
      });

      // Reset to zero after a brief delay so the bar can animate to 100%
      const resetTimer = setTimeout(() => {
        setState(prev => prev.isTracking ? prev : {
          progress: 0,
          secondsRemaining: null,
          estimatedTotal: null,
          elapsed: 0,
          isTracking: false,
        });
      }, 600);

      wasLoadingRef.current = isLoading;
      return () => clearTimeout(resetTimer);
    }

    wasLoadingRef.current = isLoading;

    // Tick loop while loading
    if (!isLoading) return;

    const estimateMs = getEstimateMs(action, intentMode);

    const interval = setInterval(() => {
      const elapsedMs = Date.now() - startTimeRef.current;
      const progress = computeProgress(elapsedMs, estimateMs);
      const remainingMs = Math.max(0, estimateMs - elapsedMs);

      setState({
        progress,
        secondsRemaining: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null,
        estimatedTotal: Math.round(estimateMs / 1000),
        elapsed: Math.round(elapsedMs / 1000),
        isTracking: true,
      });
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [isLoading, action, intentMode, getEstimateMs, recordDuration]);

  return state;
}
