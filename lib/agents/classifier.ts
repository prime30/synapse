/**
 * Request complexity classifier for PM smart routing.
 *
 * Two-stage classification:
 *   1. Heuristic pre-filter (zero LLM cost) — catches obvious TRIVIAL/COMPLEX/ARCHITECTURAL
 *   2. LLM classifier (Haiku, ~$0.005) — handles ambiguous cases
 *
 * The classified tier drives model selection, context budget, and execution path.
 */

import { getAIProvider } from '@/lib/ai/get-provider';
import { resolveModel, getProviderForModel } from './model-router';
import type { RoutingTier } from '@/lib/types/agent';

// Re-export for convenience (single canonical source is lib/types/agent.ts)
export type { RoutingTier } from '@/lib/types/agent';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  tier: RoutingTier;
  confidence: number;
  source: 'heuristic' | 'classifier' | 'default';
}

/** Numeric ordering for tier comparison (higher = more complex). */
export const TIER_ORDER: Record<RoutingTier, number> = {
  TRIVIAL: 0,
  SIMPLE: 1,
  COMPLEX: 2,
  ARCHITECTURAL: 3,
};

// ── Heuristic patterns ────────────────────────────────────────────────────

const COSMETIC_KEYWORDS = /\b(color|colour|font|spacing|padding|margin|background|text-align|border-radius|opacity|font-size|font-weight|line-height|gap|width|height|max-width|min-height|display|visibility|z-index)\b/i;

const VALUE_CHANGE_PATTERN = /\b(change|set|update|make|switch)\b.*\b(to|from|into)\b/i;

const COMPLEX_KEYWORDS = /\b(add section|new section|new feature|redesign|refactor|rebuild|rewrite|create.*component|implement|build)\b/i;

const ARCHITECTURAL_KEYWORDS = /\b(entire theme|full refactor|migrate from|restructure|overhaul|rebuild.*theme|refactor.*entire|rewrite.*all)\b/i;

const FILE_REFERENCE_PATTERN = /\b[\w-]+\.(liquid|css|js|json|scss)\b/gi;

// ── Stage 1: Heuristic pre-filter ─────────────────────────────────────────

/**
 * Fast, zero-cost heuristic classification.
 * Returns null if no confident match — falls through to LLM classifier.
 */
export function heuristicClassify(
  request: string,
  fileCount: number,
  recentDelegationCount?: number,
): RoutingTier | null {
  const wordCount = request.trim().split(/\s+/).length;
  const fileRefs = request.match(FILE_REFERENCE_PATTERN) ?? [];

  // ── ARCHITECTURAL: clear signals for theme-wide changes
  if (ARCHITECTURAL_KEYWORDS.test(request)) {
    return 'ARCHITECTURAL';
  }

  // ── COMPLEX: multi-file, structural, or feature-level changes
  if (COMPLEX_KEYWORDS.test(request)) {
    return 'COMPLEX';
  }
  if (fileRefs.length >= 3) {
    return 'COMPLEX';
  }
  if (recentDelegationCount && recentDelegationCount >= 3) {
    return 'COMPLEX';
  }

  // ── TRIVIAL: short cosmetic request targeting one file/element
  // Must match a cosmetic keyword or value-change pattern to avoid
  // mis-classifying short feature requests (e.g. "Add a hamburger menu").
  if (wordCount <= 25 && COSMETIC_KEYWORDS.test(request)) {
    return 'TRIVIAL';
  }
  if (wordCount <= 15 && VALUE_CHANGE_PATTERN.test(request)) {
    return 'TRIVIAL';
  }

  // ── No confident heuristic match
  return null;
}

// ── Stage 2: LLM classifier ──────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You classify Shopify theme editing requests by complexity. Reply with valid JSON only.

Tiers:
- TRIVIAL: Single-file cosmetic change (color, font, spacing, text, visibility)
- SIMPLE: 1-2 files, clear scope, no cross-file dependencies
- COMPLEX: 3+ files, architectural decisions, cross-file dependencies, new features
- ARCHITECTURAL: Theme-wide restructuring, migration, full redesign`;

/**
 * LLM-based classification using Haiku (~$0.005 per call).
 * Only runs when heuristic pre-filter returns null.
 */
export async function classifyWithLLM(
  request: string,
  fileCount: number,
  lastMessageSummary?: string,
): Promise<ClassificationResult> {
  try {
    const model = resolveModel({ action: 'classify' });
    const providerName = getProviderForModel(model);
    const provider = getAIProvider(providerName as 'anthropic' | 'openai' | 'google');

    const userPrompt = [
      `Request: "${request}"`,
      `File count: ${fileCount}`,
      lastMessageSummary ? `Recent context: ${lastMessageSummary}` : '',
      '',
      'Respond: {"tier":"TRIVIAL|SIMPLE|COMPLEX|ARCHITECTURAL","confidence":0.0-1.0}',
    ].filter(Boolean).join('\n');

    const result = await provider.complete(
      [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { model, maxTokens: 64, temperature: 0 },
    );

    // Parse response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { tier: 'SIMPLE', confidence: 0.5, source: 'default' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { tier?: string; confidence?: number };
    const tier = validateTier(parsed.tier);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    // Low confidence → default to SIMPLE (safe middle ground)
    if (confidence < 0.7) {
      return { tier: 'SIMPLE', confidence, source: 'classifier' };
    }

    return { tier, confidence, source: 'classifier' };
  } catch (err) {
    console.warn('[classifier] LLM classification failed, defaulting to SIMPLE:', err);
    return { tier: 'SIMPLE', confidence: 0.5, source: 'default' };
  }
}

// ── Combined classifier ───────────────────────────────────────────────────

/**
 * Classify a request's complexity tier. Tries heuristics first (free),
 * falls back to Haiku LLM (~$0.005) for ambiguous cases.
 */
export async function classifyRequest(
  request: string,
  fileCount: number,
  options?: {
    lastMessageSummary?: string;
    recentDelegationCount?: number;
    skipLLM?: boolean;
  },
): Promise<ClassificationResult> {
  // Stage 1: Heuristic (free)
  const heuristicResult = heuristicClassify(
    request,
    fileCount,
    options?.recentDelegationCount,
  );

  if (heuristicResult !== null) {
    return { tier: heuristicResult, confidence: 0.9, source: 'heuristic' };
  }

  // Stage 2: LLM classifier (if not skipped)
  if (!options?.skipLLM) {
    return classifyWithLLM(request, fileCount, options?.lastMessageSummary);
  }

  // Default fallback
  return { tier: 'SIMPLE', confidence: 0.5, source: 'default' };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function validateTier(tier: string | undefined): RoutingTier {
  if (tier === 'TRIVIAL' || tier === 'SIMPLE' || tier === 'COMPLEX' || tier === 'ARCHITECTURAL') {
    return tier;
  }
  return 'SIMPLE';
}

/**
 * Get the next tier up in the escalation chain.
 * TRIVIAL → SIMPLE → COMPLEX. COMPLEX and ARCHITECTURAL don't escalate.
 */
export function escalateTier(tier: RoutingTier): RoutingTier | null {
  switch (tier) {
    case 'TRIVIAL': return 'SIMPLE';
    case 'SIMPLE': return 'COMPLEX';
    default: return null; // No further escalation
  }
}

/**
 * Map a routing tier to the AI action used for model resolution.
 */
export function tierToAction(tier: RoutingTier): string {
  switch (tier) {
    case 'TRIVIAL': return 'classify_trivial';
    case 'SIMPLE': return 'generate';
    case 'COMPLEX': return 'analyze';
    case 'ARCHITECTURAL': return 'analyze';
  }
}
