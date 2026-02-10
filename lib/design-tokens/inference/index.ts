/**
 * REQ-52 Task 2: Token inference orchestrator.
 *
 * Combines grouping, scale detection, naming, and inconsistency detection
 * to produce enriched `InferredToken[]` from raw `ExtractedToken[]`.
 */

import type { ExtractedToken, InferredToken } from '../types';
import { groupSimilarValues, hexToRgb, rgbStringToRgb, colorDistance } from './token-grouping';
import { detectScalePattern } from './scale-detector';
import { suggestTokenName } from './naming-suggester';

// Re-export sub-modules for convenience
export { groupSimilarValues } from './token-grouping';
export { detectScalePattern } from './scale-detector';
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

/** Check if two colour strings are very close (Euclidean distance < 15 in RGB). */
function areSimilarColors(a: string, b: string): boolean {
  const rgbA = hexToRgb(a) ?? rgbStringToRgb(a);
  const rgbB = hexToRgb(b) ?? rgbStringToRgb(b);
  if (!rgbA || !rgbB) return false;
  return colorDistance(rgbA, rgbB) < 15;
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

    inferred.push({
      ...token,
      suggestedName: suggestion.name,
      confidence: suggestion.confidence,
      groupId: tokenGroupMap.get(token.id) ?? 'ungrouped',
      inconsistencies: inconsistencies.get(token.id) ?? [],
    });
  }

  return inferred;
}
