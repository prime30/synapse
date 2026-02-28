/**
 * Execution strategy types for the hybrid PM architecture.
 *
 * SIMPLE  — Fast-edit path. Parallel specialists, tight iteration limits.
 * HYBRID  — PM delegates to specialists with ChangeSummary coordination (default).
 * GOD_MODE — PM becomes sole editor with full context, no delegation, no caps.
 */

export type ExecutionStrategy = 'SIMPLE' | 'HYBRID' | 'GOD_MODE';

/**
 * Extract the execution strategy from the PM's first response.
 * Looks for "STRATEGY: SIMPLE|HYBRID|GOD_MODE" in the text.
 * Defaults to HYBRID if not found.
 */
export function extractStrategy(content: string): ExecutionStrategy {
  const match = content.match(/STRATEGY:\s*(SIMPLE|HYBRID|GOD_MODE)/i);
  if (!match) return 'HYBRID';
  return match[1].toUpperCase() as ExecutionStrategy;
}

/**
 * Suggest a default strategy from the tier classification.
 * Used as a hint — the PM's explicit STRATEGY output takes priority.
 */
export function getStrategyFromTier(tier: string): ExecutionStrategy {
  if (tier === 'TRIVIAL') return 'SIMPLE';
  if (tier === 'SIMPLE') return 'HYBRID';
  if (tier === 'COMPLEX' || tier === 'ARCHITECTURAL') return 'GOD_MODE';
  return 'HYBRID';
}
