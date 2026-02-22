/**
 * Drift detection for fine-tuned model quality monitoring.
 *
 * Compares rolling KPI windows against baseline snapshots to detect:
 *   - Mode routing accuracy drift
 *   - Conversation quality degradation
 *   - Safety score drops
 *   - Hallucination rate increases
 *   - Anti-pattern frequency spikes
 *
 * Generates alerts when drift exceeds configurable thresholds.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface BaselineSnapshot {
  snapshotId: string;
  capturedAt: string;
  sampleCount: number;
  metrics: DriftMetrics;
}

export interface DriftMetrics {
  modeAccuracy: number;
  conversationScore: number;
  safetyScore: number;
  hallucinationRate: number;
  antiPatternCleanRate: number;
  clarificationQuality: number;
  planDecompositionQuality: number;
}

export interface DriftAlert {
  metric: keyof DriftMetrics;
  baselineValue: number;
  currentValue: number;
  driftPercent: number;
  severity: 'warning' | 'critical';
  message: string;
  detectedAt: string;
}

export interface DriftReport {
  reportId: string;
  generatedAt: string;
  baseline: BaselineSnapshot;
  current: DriftMetrics;
  sampleCount: number;
  alerts: DriftAlert[];
  overallHealthy: boolean;
}

// ── Configuration ────────────────────────────────────────────────────────────

export interface DriftThresholds {
  warningDriftPercent: number;
  criticalDriftPercent: number;
  minSampleCount: number;
}

const DEFAULT_THRESHOLDS: DriftThresholds = {
  warningDriftPercent: 5,
  criticalDriftPercent: 15,
  minSampleCount: 20,
};

// ── Observation Window ───────────────────────────────────────────────────────

interface Observation {
  timestamp: number;
  metrics: DriftMetrics;
}

const observations: Observation[] = [];
const MAX_OBSERVATIONS = 500;
let currentBaseline: BaselineSnapshot | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function setBaseline(snapshot: BaselineSnapshot): void {
  currentBaseline = snapshot;
}

export function getBaseline(): BaselineSnapshot | null {
  return currentBaseline;
}

/**
 * Record a single observation from a completed evaluation.
 */
export function recordObservation(metrics: DriftMetrics): void {
  observations.push({ timestamp: Date.now(), metrics });
  if (observations.length > MAX_OBSERVATIONS) {
    observations.splice(0, observations.length - MAX_OBSERVATIONS);
  }
}

/**
 * Capture current rolling window as a new baseline.
 */
export function captureBaseline(sampleCount?: number): BaselineSnapshot {
  const n = sampleCount ?? observations.length;
  const recent = observations.slice(-n);
  const avg = averageMetrics(recent.map((o) => o.metrics));

  const snapshot: BaselineSnapshot = {
    snapshotId: `baseline-${Date.now()}`,
    capturedAt: new Date().toISOString(),
    sampleCount: recent.length,
    metrics: avg,
  };

  currentBaseline = snapshot;
  return snapshot;
}

/**
 * Generate a drift report comparing current window against baseline.
 */
export function generateDriftReport(
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
): DriftReport | null {
  if (!currentBaseline) return null;
  if (observations.length < thresholds.minSampleCount) return null;

  const recent = observations.slice(-thresholds.minSampleCount);
  const current = averageMetrics(recent.map((o) => o.metrics));
  const alerts: DriftAlert[] = [];

  const metricKeys: Array<keyof DriftMetrics> = [
    'modeAccuracy',
    'conversationScore',
    'safetyScore',
    'hallucinationRate',
    'antiPatternCleanRate',
    'clarificationQuality',
    'planDecompositionQuality',
  ];

  for (const key of metricKeys) {
    const base = currentBaseline.metrics[key];
    const curr = current[key];

    const isInverted = key === 'hallucinationRate';
    const driftPct = isInverted
      ? base === 0
        ? curr > 0
          ? 100
          : 0
        : ((curr - base) / base) * 100
      : base === 0
        ? curr === 0
          ? 0
          : -100
        : ((base - curr) / base) * 100;

    const absDrift = Math.abs(driftPct);

    if (absDrift >= thresholds.criticalDriftPercent) {
      alerts.push({
        metric: key,
        baselineValue: base,
        currentValue: curr,
        driftPercent: driftPct,
        severity: 'critical',
        message: `${key}: ${(driftPct > 0 ? '+' : '') + driftPct.toFixed(1)}% drift from baseline (${(base * 100).toFixed(1)}% -> ${(curr * 100).toFixed(1)}%)`,
        detectedAt: new Date().toISOString(),
      });
    } else if (absDrift >= thresholds.warningDriftPercent) {
      alerts.push({
        metric: key,
        baselineValue: base,
        currentValue: curr,
        driftPercent: driftPct,
        severity: 'warning',
        message: `${key}: ${(driftPct > 0 ? '+' : '') + driftPct.toFixed(1)}% drift from baseline`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return {
    reportId: `drift-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    baseline: currentBaseline,
    current,
    sampleCount: recent.length,
    alerts,
    overallHealthy: alerts.filter((a) => a.severity === 'critical').length === 0,
  };
}

/**
 * Reset all observations (for testing).
 */
export function resetObservations(): void {
  observations.length = 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function averageMetrics(metrics: DriftMetrics[]): DriftMetrics {
  const n = metrics.length;
  if (n === 0) {
    return {
      modeAccuracy: 0,
      conversationScore: 0,
      safetyScore: 0,
      hallucinationRate: 0,
      antiPatternCleanRate: 0,
      clarificationQuality: 0,
      planDecompositionQuality: 0,
    };
  }

  return {
    modeAccuracy: metrics.reduce((s, m) => s + m.modeAccuracy, 0) / n,
    conversationScore: metrics.reduce((s, m) => s + m.conversationScore, 0) / n,
    safetyScore: metrics.reduce((s, m) => s + m.safetyScore, 0) / n,
    hallucinationRate: metrics.reduce((s, m) => s + m.hallucinationRate, 0) / n,
    antiPatternCleanRate: metrics.reduce((s, m) => s + m.antiPatternCleanRate, 0) / n,
    clarificationQuality: metrics.reduce((s, m) => s + m.clarificationQuality, 0) / n,
    planDecompositionQuality: metrics.reduce((s, m) => s + m.planDecompositionQuality, 0) / n,
  };
}
