/**
 * REQ-52 Task 2: Token inference orchestrator.
 *
 * Combines grouping, scale detection, naming, and inconsistency detection
 * to produce enriched `InferredToken[]` from raw `ExtractedToken[]`.
 */

import { differenceCiede2000, parse } from 'culori';
import type { ExtractedToken, InferredToken, TokenTier } from '../types';
import { groupSimilarValues, extractNumericValue } from './token-grouping';
import { detectScalePattern, detectTypographicScale } from './scale-detector';
import { suggestTokenName } from './naming-suggester';

// ---------------------------------------------------------------------------
// Tier classification (primitive | semantic | component)
// ---------------------------------------------------------------------------

const COMPONENT_KEYWORDS = [
  'button',
  'card',
  'nav',
  'header',
  'footer',
  'modal',
  'form',
];
const SEMANTIC_KEYWORDS = [
  'primary',
  'secondary',
  'accent',
  'error',
  'success',
  'warning',
  'background',
  'foreground',
  'text',
  'heading',
  'body',
];

function inferTier(token: ExtractedToken & { suggestedName?: string }): TokenTier {
  const name = (token.name ?? '').toLowerCase();
  const checkName = (token.suggestedName ?? name).toLowerCase();
  if (!checkName) return 'primitive';

  const parts = checkName.split(/[-_.]/);
  for (const part of parts) {
    if (COMPONENT_KEYWORDS.includes(part)) return 'component';
    if (SEMANTIC_KEYWORDS.includes(part)) return 'semantic';
  }
  return 'primitive';
}

// Re-export sub-modules for convenience
export { groupSimilarValues } from './token-grouping';
export { detectScalePattern, detectTypographicScale } from './scale-detector';
export { suggestTokenName } from './naming-suggester';

// ---------------------------------------------------------------------------
// Inconsistency detection helpers
// ---------------------------------------------------------------------------

/**
 * Flag tokens that share the same value but have different existing names,
 * or tokens with very similar values that should likely be unified.
 */
function detectInconsistencies(
  tokens: ExtractedToken[],
): Map<string, string[]> {
  const issues = new Map<string, string[]>();

  // Build value → names map (only named tokens)
  const valueToNames = new Map<string, Set<string>>();
  for (const t of tokens) {
    if (!t.name) continue;
    const key = t.value.toLowerCase().trim();
    if (!valueToNames.has(key)) valueToNames.set(key, new Set());
    valueToNames.get(key)!.add(t.name);
  }

  // Same value, different names
  for (const t of tokens) {
    const key = t.value.toLowerCase().trim();
    const names = valueToNames.get(key);
    if (names && names.size > 1) {
      const tokenIssues = issues.get(t.id) ?? [];
      tokenIssues.push(
        `Same value "${t.value}" used under multiple names: ${[...names].join(', ')}`,
      );
      issues.set(t.id, tokenIssues);
    }
  }

  // Detect near-duplicate colour values that should be unified
  const colorTokens = tokens.filter((t) => t.category === 'color');
  for (let i = 0; i < colorTokens.length; i++) {
    for (let j = i + 1; j < colorTokens.length; j++) {
      const a = colorTokens[i];
      const b = colorTokens[j];
      if (a.value === b.value) continue; // already caught above
      if (areSimilarColors(a.value, b.value)) {
        for (const t of [a, b]) {
          const tokenIssues = issues.get(t.id) ?? [];
          tokenIssues.push(
            `Very similar color values "${a.value}" and "${b.value}" — consider unifying.`,
          );
          issues.set(t.id, tokenIssues);
        }
      }
    }
  }

  return issues;
}

/** Check if two colour strings are very close (CIEDE2000 deltaE ~6 = same color). */
function areSimilarColors(a: string, b: string): boolean {
  const deltaE = differenceCiede2000();
  const d = deltaE(parse(a), parse(b));
  return d !== undefined && d < 6;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full inference pipeline on a set of extracted tokens.
 *
 * Steps:
 *   1. Group similar values → `TokenGroup[]`
 *   2. Detect spacing scale patterns
 *   3. Suggest names for each token
 *   4. Flag inconsistencies
 *   5. Return `InferredToken[]`
 */
export function inferTokens(extractedTokens: ExtractedToken[]): InferredToken[] {
  if (extractedTokens.length === 0) return [];

  // 1. Group
  const groups = groupSimilarValues(extractedTokens);

  // 2. Detect spacing scales (informational — enriches group patterns)
  const spacingTokens = extractedTokens.filter((t) => t.category === 'spacing');
  const scale = detectScalePattern(spacingTokens);
  if (scale) {
    // Annotate spacing groups with scale info
    for (const g of groups) {
      if (g.category === 'spacing') {
        g.pattern += ` (scale: base=${scale.baseValue}, ratio=${scale.ratio})`;
      }
    }
  }

  // 2b. Detect typographic scale (font sizes)
  const typoTokens = extractedTokens.filter((t) => t.category === 'typography');
  const fontSizes = typoTokens
    .map((t) => extractNumericValue(t.value))
    .filter((n): n is number => n !== null && n > 0);
  const typoScale = detectTypographicScale(fontSizes);
  if (typoScale) {
    for (const g of groups) {
      if (g.category === 'typography') {
        g.pattern += ` (typographic scale: base=${typoScale.baseSize}px, ratio=${typoScale.ratio})`;
      }
    }
  }

  // 3. Build token → groupId lookup
  const tokenGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const t of g.tokens) {
      tokenGroupMap.set(t.id, g.id);
    }
  }

  // 4. Detect inconsistencies
  const inconsistencies = detectInconsistencies(extractedTokens);

  // 5. Suggest names & assemble InferredTokens
  const existingNames: string[] = [];
  const inferred: InferredToken[] = [];

  for (const token of extractedTokens) {
    const suggestion = suggestTokenName(token, existingNames);
    existingNames.push(suggestion.name);

    const tokenWithSuggestion = { ...token, suggestedName: suggestion.name };
    inferred.push({
      ...token,
      suggestedName: suggestion.name,
      confidence: suggestion.confidence,
      groupId: tokenGroupMap.get(token.id) ?? 'ungrouped',
      inconsistencies: inconsistencies.get(token.id) ?? [],
      tier: inferTier(tokenWithSuggestion),
    });
  }

  return inferred;
}
