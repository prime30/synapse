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

const COMPLEX_KEYWORDS = /\b(add section|new section|new feature|redesign|refactor|rebuild|rewrite|create.*component)\b/i;

/** Single-file edit that needs Liquid + styling + data (metafield/variant) in one place → COMPLEX so God Mode runs instead of delegating to multiple specialists. */
const ADD_UNDER_ELEMENT = /\b(add|insert|show|display)\b.*\b(under|below|underneath|in)\b.*\b(badge|swatch|block|section)\b/i;
const DATA_OR_STYLING_CONCERN = /\b(metafield|variant|option\d|contrast|styling|style|lengths?|custom_values)\b/i;

/** Three-file edit: Liquid + CSS + JS implied (snippet/template + style + script) → COMPLEX so God Mode runs. */
const LIQUID_OR_SNIPPET = /\b(liquid|snippet|\.liquid|template)\b/i;
const STYLING_REF = /\b(css|style|styling|\.css)\b/i;
const SCRIPT_REF = /\.js\b|\b(javascript|script)\b/i;

const ARCHITECTURAL_KEYWORDS = /\b(entire theme|full refactor|migrate from|restructure|overhaul|rebuild.*theme|refactor.*entire|rewrite.*all)\b/i;

const FILE_REFERENCE_PATTERN = /\b[\w-]+\.(liquid|css|js|json|scss)\b/gi;

// Signals that prior conversation involved code generation (not just Q&A).
const CODE_GENERATION_SIGNALS = /\b(created|added|built|implemented|wrote|generated|modified|updated|refactored|inserted|snippet|section|component|template|file)\b/i;

// Follow-up language that implies iterating on prior work.
const FOLLOW_UP_SIGNALS = /\b(now|also|next|then|additionally|make it|update it|fix it|add to it|extend|improve|adjust|tweak)\b/i;

// ── Stage 1: Heuristic pre-filter ─────────────────────────────────────────

export interface HeuristicOptions {
  recentDelegationCount?: number;
  recentMessages?: string[];
}

/**
 * Fast, zero-cost heuristic classification.
 * Returns null if no confident match — falls through to LLM classifier.
 */
export function heuristicClassify(
  request: string,
  fileCount: number,
  options?: number | HeuristicOptions,
): RoutingTier | null {
  const opts: HeuristicOptions = typeof options === 'number'
    ? { recentDelegationCount: options }
    : options ?? {};

  const wordCount = request.trim().split(/\s+/).length;
  const fileRefs = request.match(FILE_REFERENCE_PATTERN) ?? [];

  // ── Mode-switch acceleration: Ask → Code with prior code suggestions.
  // Don't downgrade to SIMPLE if the request content is actually complex.
  if (request.includes('[Mode switch:') && !ARCHITECTURAL_KEYWORDS.test(request)) {
    return 'SIMPLE';
  }

  // ── ARCHITECTURAL: clear signals for theme-wide changes
  if (ARCHITECTURAL_KEYWORDS.test(request)) {
    return 'ARCHITECTURAL';
  }

  // ── COMPLEX: multi-file, structural, or feature-level changes
  if (COMPLEX_KEYWORDS.test(request)) {
    return 'COMPLEX';
  }
  // Single-snippet edit with styling + data (e.g. "add lengths under badge, contrast-aware, metafield") → God Mode, not HYBRID
  if (ADD_UNDER_ELEMENT.test(request) && DATA_OR_STYLING_CONCERN.test(request)) {
    return 'COMPLEX';
  }
  // Three-file edit: Liquid + CSS + JS (snippet + style + script) → God Mode
  if (LIQUID_OR_SNIPPET.test(request) && STYLING_REF.test(request) && SCRIPT_REF.test(request)) {
    return 'COMPLEX';
  }
  if (fileRefs.length >= 3) {
    return 'COMPLEX';
  }
  if (opts.recentDelegationCount && opts.recentDelegationCount >= 3) {
    return 'COMPLEX';
  }

  // ── Multi-turn conversation floor: if prior messages describe code
  // generation and the current request iterates on that work, the task
  // is at least COMPLEX — the agent needs full context of what was built.
  if (opts.recentMessages && opts.recentMessages.length >= 2) {
    const history = opts.recentMessages.join(' ');
    const historyHasCodeGen = CODE_GENERATION_SIGNALS.test(history);
    const requestIsFollowUp = FOLLOW_UP_SIGNALS.test(request);
    if (historyHasCodeGen && requestIsFollowUp) {
      return 'COMPLEX';
    }
  }

  // ── TRIVIAL: short cosmetic request targeting one file/element
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
- TRIVIAL: Single-file cosmetic change (color, font, spacing, text, visibility) — one clear value change.
- SIMPLE: 1-2 files, truly independent changes (e.g. change one color in CSS, no Liquid or data logic).
- COMPLEX: 3+ files, OR one/two/three files with multiple concerns (e.g. add markup in Liquid + styling in CSS + behavior in JS). Prefer COMPLEX when the request combines template/markup + styling + JS/script so one agent (God Mode) can complete it without delegating to specialists.
- ARCHITECTURAL: Theme-wide restructuring, migration, full redesign

Important: If the request targets a single snippet or 2–3 files and involves Liquid + CSS + JS (markup, styling, and script/behavior), classify as COMPLEX so God Mode runs. If the request is a follow-up in a multi-turn conversation where code was previously generated, classify based on the CUMULATIVE complexity of the full feature, not just the follow-up message in isolation.`;

export interface LLMClassifyOptions {
  lastMessageSummary?: string;
  recentMessages?: string[];
}

/**
 * LLM-based classification using Haiku (~$0.005 per call).
 * Only runs when heuristic pre-filter returns null.
 */
export async function classifyWithLLM(
  request: string,
  fileCount: number,
  options?: string | LLMClassifyOptions,
): Promise<ClassificationResult> {
  const opts: LLMClassifyOptions = typeof options === 'string'
    ? { lastMessageSummary: options }
    : options ?? {};

  const recentHistory = (opts.recentMessages ?? []).join(' ');
  const conversationFloor: RoutingTier | null =
    (opts.recentMessages?.length ?? 0) >= 2 &&
    CODE_GENERATION_SIGNALS.test(recentHistory) &&
    FOLLOW_UP_SIGNALS.test(request)
      ? 'COMPLEX'
      : null;

  try {
    const model = resolveModel({ action: 'classify' });
    const providerName = getProviderForModel(model);
    const provider = getAIProvider(providerName as 'anthropic' | 'openai' | 'google');

    const contextLines: string[] = [];
    if (opts.recentMessages && opts.recentMessages.length > 0) {
      contextLines.push('Conversation history (oldest first):');
      for (let i = 0; i < opts.recentMessages.length; i++) {
        const role = i % 2 === 0 ? 'User' : 'Assistant';
        const msg = opts.recentMessages[i].slice(0, 200);
        contextLines.push(`  ${role}: ${msg}`);
      }
      contextLines.push('(This is a follow-up to the conversation above.)');
    } else if (opts.lastMessageSummary) {
      contextLines.push(`Recent context: ${opts.lastMessageSummary}`);
    }

    const userPrompt = [
      `Request: "${request}"`,
      `File count: ${fileCount}`,
      ...contextLines,
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

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const fallbackTier = conversationFloor ?? 'SIMPLE';
      return { tier: fallbackTier, confidence: 0.5, source: 'default' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { tier?: string; confidence?: number };
    let tier = validateTier(parsed.tier);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    // Apply conversation floor: multi-turn code generation is at least COMPLEX
    if (conversationFloor && TIER_ORDER[tier] < TIER_ORDER[conversationFloor]) {
      tier = conversationFloor;
    }

    // Low confidence without conversation context → default to SIMPLE
    if (confidence < 0.7 && !conversationFloor) {
      return { tier: 'SIMPLE', confidence, source: 'classifier' };
    }

    return { tier, confidence, source: 'classifier' };
  } catch (err) {
    console.warn('[classifier] LLM classification failed:', err);
    const fallbackTier = conversationFloor ?? 'SIMPLE';
    return { tier: fallbackTier, confidence: 0.5, source: 'default' };
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
    recentMessages?: string[];
    recentDelegationCount?: number;
    skipLLM?: boolean;
  },
): Promise<ClassificationResult> {
  // Stage 1: Heuristic (free)
  const heuristicResult = heuristicClassify(request, fileCount, {
    recentDelegationCount: options?.recentDelegationCount,
    recentMessages: options?.recentMessages,
  });

  if (heuristicResult !== null) {
    return { tier: heuristicResult, confidence: 0.9, source: 'heuristic' };
  }

  // Stage 2: LLM classifier (if not skipped)
  if (!options?.skipLLM) {
    return classifyWithLLM(request, fileCount, {
      lastMessageSummary: options?.lastMessageSummary,
      recentMessages: options?.recentMessages,
    });
  }

  // Default fallback -- respect multi-turn conversation floor only with code-gen signals
  if (options?.recentMessages && options.recentMessages.length >= 2) {
    const hist = options.recentMessages.join(' ');
    if (CODE_GENERATION_SIGNALS.test(hist) && FOLLOW_UP_SIGNALS.test(request)) {
      return { tier: 'COMPLEX', confidence: 0.5, source: 'default' };
    }
  }
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
