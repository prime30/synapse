/**
 * Token cost calculator for AI model usage billing.
 *
 * Per-million-token rates in USD. Rates are updated whenever
 * we on-board a new model in the model-router.
 */

// Per-million-token rates in dollars
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },

  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },

  // Google
  'gemini-3-flash-preview': { input: 0.5, output: 3.0 },
  'gemini-3-pro-preview': { input: 2.0, output: 12.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },

  // xAI -- Grok (dashboard: grok-4-0709 $3/$15, fast variants $0.20/$0.50, grok-code-fast-1 $0.20/$1.50)
  'grok-4': { input: 3.0, output: 15.0 },
  'grok-4-0709': { input: 3.0, output: 15.0 },
  'grok-4-1-fast-reasoning': { input: 0.20, output: 0.50 },
  'grok-4-1-fast-non-reasoning': { input: 0.20, output: 0.50 },
  'grok-4-fast-reasoning': { input: 0.20, output: 0.50 },
  'grok-4-fast-non-reasoning': { input: 0.20, output: 0.50 },
  'grok-code-fast-1': { input: 0.20, output: 1.50 },
};

/**
 * Calculate cost in cents for a given model and token counts.
 * Returns 0 for unknown models (fail-open so recording never breaks).
 */
export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_RATES[model];
  if (!rates) return 0;

  const inputCost = (inputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;
  // Convert to cents and round up so we never under-bill
  return Math.ceil((inputCost + outputCost) * 100);
}

/**
 * Get the per-million-token rate for a model, or null if unknown.
 */
export function getModelRate(
  model: string,
): { input: number; output: number } | null {
  return MODEL_RATES[model] ?? null;
}

/**
 * List all models we have pricing data for.
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_RATES);
}
