/**
 * Hybrid router bridge for fine-tuned model integration.
 *
 * Routes ask/plan traffic to the tuned model while keeping code execution
 * on premium models. Supports:
 *   - Canary rollout with configurable traffic percentage
 *   - Automatic rollback on KPI regression
 *   - Runtime guard enforcement (tuned model cannot bypass policies)
 *   - OpenAI-compatible endpoint for self-hosted models (vLLM, TGI, etc.)
 */

import type { AIAction, ModelId } from '../agents/model-router';

// ── Configuration ────────────────────────────────────────────────────────────

export interface TunedModelConfig {
  enabled: boolean;
  modelId: string;
  endpoint: string;
  apiKey?: string;
  /** Actions routed to the tuned model instead of default */
  routedActions: AIAction[];
  /** Canary: percentage of traffic (0-100) sent to tuned model */
  canaryPercent: number;
  /** KPI thresholds that trigger automatic rollback */
  rollbackThresholds: {
    maxHallucinationRate: number;
    minModeAccuracy: number;
    minConversationScore: number;
    minSafetyScore: number;
  };
}

export interface CanaryDecision {
  useTunedModel: boolean;
  reason: string;
  modelId: string;
}

export interface RollbackState {
  isRolledBack: boolean;
  rolledBackAt?: string;
  reason?: string;
  kpiSnapshot?: Record<string, number>;
}

// ── Default Configuration ────────────────────────────────────────────────────

const DEFAULT_CONFIG: TunedModelConfig = {
  enabled: false,
  modelId: 'synapse-shopify-tuned',
  endpoint: 'http://localhost:8000/v1',
  routedActions: ['ask', 'plan', 'chat', 'explain', 'classify'],
  canaryPercent: 0,
  rollbackThresholds: {
    maxHallucinationRate: 0.1,
    minModeAccuracy: 0.9,
    minConversationScore: 0.6,
    minSafetyScore: 0.8,
  },
};

// ── State ────────────────────────────────────────────────────────────────────

let currentConfig: TunedModelConfig = { ...DEFAULT_CONFIG };
let rollbackState: RollbackState = { isRolledBack: false };

// KPI tracking (rolling window)
const KPI_WINDOW_SIZE = 100;
const kpiWindow: Array<{
  timestamp: number;
  hallucinationRate: number;
  modeCorrect: boolean;
  conversationScore: number;
  safetyScore: number;
}> = [];

// ── Public API ───────────────────────────────────────────────────────────────

export function configureTunedModel(config: Partial<TunedModelConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function getTunedModelConfig(): Readonly<TunedModelConfig> {
  return { ...currentConfig };
}

export function getRollbackState(): Readonly<RollbackState> {
  return { ...rollbackState };
}

/**
 * Decide whether to route a specific action to the tuned model.
 * This is called from resolveModel() in model-router.ts.
 */
export function shouldUseTunedModel(action: AIAction): CanaryDecision {
  if (!currentConfig.enabled) {
    return { useTunedModel: false, reason: 'tuned model disabled', modelId: '' };
  }

  if (rollbackState.isRolledBack) {
    return {
      useTunedModel: false,
      reason: `rolled back: ${rollbackState.reason}`,
      modelId: '',
    };
  }

  if (!currentConfig.routedActions.includes(action)) {
    return {
      useTunedModel: false,
      reason: `action "${action}" not routed to tuned model`,
      modelId: '',
    };
  }

  if (currentConfig.canaryPercent <= 0) {
    return { useTunedModel: false, reason: 'canary at 0%', modelId: '' };
  }

  if (currentConfig.canaryPercent >= 100) {
    return {
      useTunedModel: true,
      reason: 'canary at 100%',
      modelId: currentConfig.modelId,
    };
  }

  const roll = Math.random() * 100;
  if (roll < currentConfig.canaryPercent) {
    return {
      useTunedModel: true,
      reason: `canary hit (${roll.toFixed(1)}% < ${currentConfig.canaryPercent}%)`,
      modelId: currentConfig.modelId,
    };
  }

  return {
    useTunedModel: false,
    reason: `canary miss (${roll.toFixed(1)}% >= ${currentConfig.canaryPercent}%)`,
    modelId: '',
  };
}

/**
 * Record a KPI observation from a completed request.
 * Automatically triggers rollback if thresholds are violated.
 */
export function recordKPIObservation(observation: {
  hallucinationRate: number;
  modeCorrect: boolean;
  conversationScore: number;
  safetyScore: number;
}): void {
  kpiWindow.push({ timestamp: Date.now(), ...observation });

  if (kpiWindow.length > KPI_WINDOW_SIZE) {
    kpiWindow.splice(0, kpiWindow.length - KPI_WINDOW_SIZE);
  }

  if (kpiWindow.length >= 10) {
    checkRollbackConditions();
  }
}

/**
 * Manually reset rollback state (after fixing the model).
 */
export function resetRollback(): void {
  rollbackState = { isRolledBack: false };
  kpiWindow.length = 0;
}

/**
 * Get the OpenAI-compatible endpoint config for the tuned model.
 * Compatible with vLLM, TGI, Ollama, etc.
 */
export function getTunedModelEndpoint(): {
  baseURL: string;
  model: string;
  apiKey?: string;
} {
  return {
    baseURL: currentConfig.endpoint,
    model: currentConfig.modelId,
    apiKey: currentConfig.apiKey,
  };
}

// ── Internal ─────────────────────────────────────────────────────────────────

function checkRollbackConditions(): void {
  if (rollbackState.isRolledBack) return;

  const t = currentConfig.rollbackThresholds;
  const n = kpiWindow.length;

  const avgHallucination = kpiWindow.reduce((s, o) => s + o.hallucinationRate, 0) / n;
  const modeAccuracy = kpiWindow.filter((o) => o.modeCorrect).length / n;
  const avgConversation = kpiWindow.reduce((s, o) => s + o.conversationScore, 0) / n;
  const avgSafety = kpiWindow.reduce((s, o) => s + o.safetyScore, 0) / n;

  const violations: string[] = [];

  if (avgHallucination > t.maxHallucinationRate) {
    violations.push(
      `hallucination ${(avgHallucination * 100).toFixed(1)}% > ${(t.maxHallucinationRate * 100).toFixed(1)}%`,
    );
  }
  if (modeAccuracy < t.minModeAccuracy) {
    violations.push(
      `mode accuracy ${(modeAccuracy * 100).toFixed(1)}% < ${(t.minModeAccuracy * 100).toFixed(1)}%`,
    );
  }
  if (avgConversation < t.minConversationScore) {
    violations.push(
      `conversation ${(avgConversation * 100).toFixed(1)}% < ${(t.minConversationScore * 100).toFixed(1)}%`,
    );
  }
  if (avgSafety < t.minSafetyScore) {
    violations.push(
      `safety ${(avgSafety * 100).toFixed(1)}% < ${(t.minSafetyScore * 100).toFixed(1)}%`,
    );
  }

  if (violations.length > 0) {
    rollbackState = {
      isRolledBack: true,
      rolledBackAt: new Date().toISOString(),
      reason: violations.join('; '),
      kpiSnapshot: {
        hallucinationRate: avgHallucination,
        modeAccuracy,
        conversationScore: avgConversation,
        safetyScore: avgSafety,
      },
    };

    console.error(
      `[hybrid-router] AUTO-ROLLBACK triggered: ${violations.join('; ')}`,
    );
  }
}

// ── Environment-based initialization ─────────────────────────────────────────

export function initFromEnv(): void {
  const enabled = process.env.TUNED_MODEL_ENABLED === 'true';
  const endpoint = process.env.TUNED_MODEL_ENDPOINT;
  const modelId = process.env.TUNED_MODEL_ID;
  const apiKey = process.env.TUNED_MODEL_API_KEY;
  const canary = parseInt(process.env.TUNED_MODEL_CANARY_PERCENT ?? '0', 10);

  if (enabled && endpoint) {
    configureTunedModel({
      enabled: true,
      endpoint,
      modelId: modelId ?? 'synapse-shopify-tuned',
      apiKey: apiKey || undefined,
      canaryPercent: Number.isFinite(canary) ? Math.max(0, Math.min(100, canary)) : 0,
    });
  }
}
