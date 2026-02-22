/**
 * Continuous learning loop: hard-case replay, retraining governance,
 * and promotion pipeline.
 *
 * Orchestrates the weekly cycle of:
 *   1. Collect production misses (with privacy controls)
 *   2. Bucket by failure mode
 *   3. Feed into hard-case replay suite
 *   4. Trigger retraining when drift detected
 *   5. Run eval gate before promotion
 *   6. Track promotion history
 */

import type { IntentMode } from './behavior-spec';
import type { DriftReport } from './drift-detector';
import type { FinetuneEvalSummary } from './eval-dimensions';

// ── Types ────────────────────────────────────────────────────────────────────

export type FailureCategory =
  | 'mode_misrouting'
  | 'hallucination'
  | 'loop_stagnation'
  | 'missing_completion_format'
  | 'deprecated_api_usage'
  | 'safety_violation'
  | 'clarification_quality'
  | 'plan_quality'
  | 'user_correction'
  | 'other';

export interface ProductionMiss {
  id: string;
  capturedAt: string;
  category: FailureCategory;
  mode: IntentMode;
  promptHash: string;
  responseHash: string;
  /** Redacted prompt text (never raw user data) */
  redactedPrompt: string;
  /** What went wrong */
  failureDescription: string;
  /** Expected correct behavior */
  expectedBehavior: string;
  /** Whether user explicitly corrected the response */
  userCorrected: boolean;
  /** Severity: how impactful this miss was */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HardCaseReplaySuite {
  id: string;
  generatedAt: string;
  cases: ProductionMiss[];
  categoryDistribution: Record<FailureCategory, number>;
  totalCases: number;
}

export interface RetrainingTrigger {
  reason: 'drift_detected' | 'hard_case_threshold' | 'scheduled' | 'manual';
  triggeredAt: string;
  driftReport?: DriftReport;
  hardCaseCount?: number;
}

export interface PromotionCandidate {
  modelId: string;
  trainRunId: string;
  evalSummary: FinetuneEvalSummary;
  baselineComparison: {
    modeAccuracyDelta: number;
    conversationScoreDelta: number;
    safetyScoreDelta: number;
    hallucinationRateDelta: number;
  };
  promotionDecision: 'promoted' | 'rejected' | 'pending';
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
}

export interface PromotionRecord {
  id: string;
  candidate: PromotionCandidate;
  previousModelId: string;
  promotedAt: string;
  canaryPercent: number;
}

// ── Hard Case Collection ─────────────────────────────────────────────────────

const hardCases: ProductionMiss[] = [];
const MAX_HARD_CASES = 1000;
const RETRAIN_THRESHOLD = 50;

export function recordProductionMiss(miss: ProductionMiss): void {
  hardCases.push(miss);
  if (hardCases.length > MAX_HARD_CASES) {
    hardCases.splice(0, hardCases.length - MAX_HARD_CASES);
  }
}

export function getHardCaseCount(): number {
  return hardCases.length;
}

export function buildHardCaseReplaySuite(): HardCaseReplaySuite {
  const distribution: Record<FailureCategory, number> = {
    mode_misrouting: 0,
    hallucination: 0,
    loop_stagnation: 0,
    missing_completion_format: 0,
    deprecated_api_usage: 0,
    safety_violation: 0,
    clarification_quality: 0,
    plan_quality: 0,
    user_correction: 0,
    other: 0,
  };

  for (const c of hardCases) {
    distribution[c.category]++;
  }

  return {
    id: `replay-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    cases: [...hardCases],
    categoryDistribution: distribution,
    totalCases: hardCases.length,
  };
}

// ── Retraining Governance ────────────────────────────────────────────────────

const retrainingHistory: RetrainingTrigger[] = [];

export function shouldTriggerRetraining(driftReport?: DriftReport): RetrainingTrigger | null {
  if (driftReport && !driftReport.overallHealthy) {
    const trigger: RetrainingTrigger = {
      reason: 'drift_detected',
      triggeredAt: new Date().toISOString(),
      driftReport,
    };
    retrainingHistory.push(trigger);
    return trigger;
  }

  if (hardCases.length >= RETRAIN_THRESHOLD) {
    const trigger: RetrainingTrigger = {
      reason: 'hard_case_threshold',
      triggeredAt: new Date().toISOString(),
      hardCaseCount: hardCases.length,
    };
    retrainingHistory.push(trigger);
    return trigger;
  }

  return null;
}

export function triggerManualRetraining(): RetrainingTrigger {
  const trigger: RetrainingTrigger = {
    reason: 'manual',
    triggeredAt: new Date().toISOString(),
    hardCaseCount: hardCases.length,
  };
  retrainingHistory.push(trigger);
  return trigger;
}

export function getRetrainingHistory(): readonly RetrainingTrigger[] {
  return retrainingHistory;
}

// ── Promotion Pipeline ───────────────────────────────────────────────────────

const promotionHistory: PromotionRecord[] = [];

/**
 * Evaluate a candidate for promotion based on eval summary comparison.
 * All criteria must pass for promotion approval.
 */
export function evaluatePromotion(
  candidate: PromotionCandidate,
): PromotionCandidate {
  const { baselineComparison, evalSummary } = candidate;
  const failures: string[] = [];

  if (!evalSummary.overallPass) {
    failures.push('eval suite did not pass overall');
  }

  if (baselineComparison.modeAccuracyDelta < -0.02) {
    failures.push(
      `mode accuracy regressed by ${(Math.abs(baselineComparison.modeAccuracyDelta) * 100).toFixed(1)}%`,
    );
  }

  if (baselineComparison.conversationScoreDelta < -0.05) {
    failures.push(
      `conversation score regressed by ${(Math.abs(baselineComparison.conversationScoreDelta) * 100).toFixed(1)}%`,
    );
  }

  if (baselineComparison.safetyScoreDelta < -0.01) {
    failures.push(
      `safety score regressed by ${(Math.abs(baselineComparison.safetyScoreDelta) * 100).toFixed(1)}%`,
    );
  }

  if (baselineComparison.hallucinationRateDelta > 0.02) {
    failures.push(
      `hallucination rate increased by ${(baselineComparison.hallucinationRateDelta * 100).toFixed(1)}%`,
    );
  }

  if (failures.length === 0) {
    return {
      ...candidate,
      promotionDecision: 'promoted',
      decidedAt: new Date().toISOString(),
    };
  }

  return {
    ...candidate,
    promotionDecision: 'rejected',
    decidedAt: new Date().toISOString(),
    rejectionReason: failures.join('; '),
  };
}

/**
 * Record a successful promotion.
 */
export function recordPromotion(
  candidate: PromotionCandidate,
  previousModelId: string,
  canaryPercent: number,
): PromotionRecord {
  const record: PromotionRecord = {
    id: `promo-${Date.now()}`,
    candidate,
    previousModelId,
    promotedAt: new Date().toISOString(),
    canaryPercent,
  };
  promotionHistory.push(record);
  return record;
}

export function getPromotionHistory(): readonly PromotionRecord[] {
  return promotionHistory;
}

// ── Weekly Cycle Orchestration ───────────────────────────────────────────────

export interface WeeklyCycleReport {
  cycleId: string;
  generatedAt: string;
  hardCaseSuite: HardCaseReplaySuite;
  retrainingTriggered: boolean;
  retrainingTrigger?: RetrainingTrigger;
  promotionCandidate?: PromotionCandidate;
  actions: string[];
}

/**
 * Run the weekly continuous learning cycle.
 * Call this from a scheduled job (cron, CI, or manual trigger).
 */
export function runWeeklyCycle(driftReport?: DriftReport): WeeklyCycleReport {
  const actions: string[] = [];

  // 1. Build hard case replay suite
  const suite = buildHardCaseReplaySuite();
  actions.push(`Built replay suite with ${suite.totalCases} cases`);

  // 2. Check retraining triggers
  const trigger = shouldTriggerRetraining(driftReport);
  if (trigger) {
    actions.push(`Retraining triggered: ${trigger.reason}`);
    actions.push('Action: run finetune:dataset then finetune:config then LlamaFactory training');
  } else {
    actions.push('No retraining trigger (KPIs healthy, hard cases below threshold)');
  }

  // 3. Log category distribution for prioritization
  const topCategories = Object.entries(suite.categoryDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (topCategories.length > 0) {
    actions.push(
      `Top failure categories: ${topCategories.map(([k, v]) => `${k}(${v})`).join(', ')}`,
    );
  }

  return {
    cycleId: `cycle-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    hardCaseSuite: suite,
    retrainingTriggered: !!trigger,
    retrainingTrigger: trigger ?? undefined,
    actions,
  };
}

/**
 * Clear hard cases after they've been incorporated into training data.
 */
export function clearHardCases(): void {
  hardCases.length = 0;
}
