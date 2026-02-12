/**
 * Nudge Feedback — tracks Yes/Dismiss outcomes per signal type and
 * auto-tunes confidence thresholds so dismissed signals are dampened.
 *
 * Persists to localStorage for cross-session learning.
 * Pure functions + data helpers, no React dependencies.
 * @module lib/ai/nudge-feedback
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 6 ambient intelligence signal types. */
export type AmbientSignalType =
  | 'missing-schema'
  | 'unused-variable'
  | 'broken-reference'
  | 'style-inconsistency'
  | 'performance-issue'
  | 'accessibility-gap';

/** Outcome of a user interaction with a nudge. */
export type NudgeOutcome = 'accepted' | 'dismissed' | 'expired';

/** Feedback record for a single nudge interaction. */
export interface NudgeFeedbackEntry {
  signalType: AmbientSignalType;
  outcome: NudgeOutcome;
  timestamp: number;
  /** Optional context about what was nudged (e.g. file name). */
  context?: string;
}

/** Aggregated stats for a signal type. */
export interface SignalStats {
  accepted: number;
  dismissed: number;
  expired: number;
  total: number;
  /** Acceptance rate: accepted / (accepted + dismissed). Expired excluded. */
  acceptanceRate: number;
  /** Dampening multiplier: 0–1. Lower = more dampened. */
  dampeningFactor: number;
}

/** Confidence threshold overrides per signal type. */
export type ThresholdOverrides = Partial<Record<AmbientSignalType, number>>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'synapse:nudge-feedback';
const THRESHOLD_KEY = 'synapse:nudge-thresholds';
const MAX_ENTRIES = 500;

/** Default confidence thresholds per signal type. */
export const DEFAULT_THRESHOLDS: Record<AmbientSignalType, number> = {
  'missing-schema': 0.6,
  'unused-variable': 0.5,
  'broken-reference': 0.7,
  'style-inconsistency': 0.5,
  'performance-issue': 0.6,
  'accessibility-gap': 0.5,
};

/** Minimum threshold — even heavily dismissed signals can still fire. */
const MIN_THRESHOLD = 0.3;
/** Maximum threshold — signals don't get dampened beyond this. */
const MAX_THRESHOLD = 0.95;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadEntries(): NudgeFeedbackEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NudgeFeedbackEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: NudgeFeedbackEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Cap to prevent localStorage bloat
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function loadThresholds(): ThresholdOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ThresholdOverrides;
  } catch {
    return {};
  }
}

function saveThresholds(overrides: ThresholdOverrides): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify(overrides));
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a nudge outcome (accepted, dismissed, or expired).
 * Automatically recomputes and persists threshold overrides.
 */
export function recordNudgeFeedback(
  signalType: AmbientSignalType,
  outcome: NudgeOutcome,
  context?: string,
): void {
  const entries = loadEntries();
  entries.push({
    signalType,
    outcome,
    timestamp: Date.now(),
    context,
  });
  saveEntries(entries);

  // Recompute thresholds for this signal type
  recomputeThreshold(signalType, entries);
}

/**
 * Get aggregated stats for a signal type.
 */
export function getSignalStats(signalType: AmbientSignalType): SignalStats {
  const entries = loadEntries().filter((e) => e.signalType === signalType);
  return computeStats(entries);
}

/**
 * Get aggregated stats for all signal types.
 */
export function getAllSignalStats(): Record<AmbientSignalType, SignalStats> {
  const entries = loadEntries();
  const allTypes: AmbientSignalType[] = [
    'missing-schema',
    'unused-variable',
    'broken-reference',
    'style-inconsistency',
    'performance-issue',
    'accessibility-gap',
  ];

  const result = {} as Record<AmbientSignalType, SignalStats>;
  for (const type of allTypes) {
    const typeEntries = entries.filter((e) => e.signalType === type);
    result[type] = computeStats(typeEntries);
  }
  return result;
}

/**
 * Get the effective confidence threshold for a signal type.
 * Combines the default threshold with any learned overrides.
 */
export function getEffectiveThreshold(signalType: AmbientSignalType): number {
  const overrides = loadThresholds();
  return overrides[signalType] ?? DEFAULT_THRESHOLDS[signalType];
}

/**
 * Get all effective thresholds.
 */
export function getAllThresholds(): Record<AmbientSignalType, number> {
  const overrides = loadThresholds();
  const result = { ...DEFAULT_THRESHOLDS };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      result[key as AmbientSignalType] = value;
    }
  }
  return result;
}

/**
 * Check if a signal should be shown based on its confidence and learned threshold.
 */
export function shouldShowNudge(
  signalType: AmbientSignalType,
  confidence: number,
): boolean {
  const threshold = getEffectiveThreshold(signalType);
  return confidence >= threshold;
}

/**
 * Reset all feedback data and thresholds (useful for testing or user reset).
 */
export function resetNudgeFeedback(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(THRESHOLD_KEY);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeStats(entries: NudgeFeedbackEntry[]): SignalStats {
  const accepted = entries.filter((e) => e.outcome === 'accepted').length;
  const dismissed = entries.filter((e) => e.outcome === 'dismissed').length;
  const expired = entries.filter((e) => e.outcome === 'expired').length;
  const total = entries.length;

  const interactions = accepted + dismissed;
  const acceptanceRate = interactions > 0 ? accepted / interactions : 0.5;

  // Dampening: based on acceptance rate with recency weighting
  // If acceptance rate < 0.3, heavily dampen. If > 0.7, no dampening.
  const dampeningFactor = interactions < 3
    ? 1.0  // Not enough data — don't dampen
    : Math.max(0.2, Math.min(1.0, acceptanceRate * 1.5));

  return { accepted, dismissed, expired, total, acceptanceRate, dampeningFactor };
}

/**
 * Recompute the threshold for a signal type based on recent feedback.
 *
 * Strategy:
 * - High dismiss rate (> 70%) → raise threshold (harder to trigger)
 * - High accept rate (> 70%) → lower threshold (easier to trigger)
 * - Neutral → drift toward default
 *
 * Uses exponential moving average weighted toward recent entries.
 */
function recomputeThreshold(
  signalType: AmbientSignalType,
  allEntries: NudgeFeedbackEntry[],
): void {
  const typeEntries = allEntries.filter((e) => e.signalType === signalType);

  // Need at least 5 interactions to start adjusting
  const interactions = typeEntries.filter((e) => e.outcome !== 'expired');
  if (interactions.length < 5) return;

  // Weight recent entries more heavily (last 20 interactions)
  const recent = interactions.slice(-20);
  const recentAccepted = recent.filter((e) => e.outcome === 'accepted').length;
  const recentRate = recentAccepted / recent.length;

  const defaultThreshold = DEFAULT_THRESHOLDS[signalType];
  let newThreshold: number;

  if (recentRate < 0.3) {
    // Heavily dismissed — raise threshold
    newThreshold = Math.min(MAX_THRESHOLD, defaultThreshold + (1 - recentRate) * 0.3);
  } else if (recentRate > 0.7) {
    // Frequently accepted — lower threshold
    newThreshold = Math.max(MIN_THRESHOLD, defaultThreshold - recentRate * 0.2);
  } else {
    // Neutral — drift toward default
    const currentOverrides = loadThresholds();
    const current = currentOverrides[signalType] ?? defaultThreshold;
    newThreshold = current + (defaultThreshold - current) * 0.1;
  }

  // Persist
  const overrides = loadThresholds();
  overrides[signalType] = Math.round(newThreshold * 100) / 100;
  saveThresholds(overrides);
}
