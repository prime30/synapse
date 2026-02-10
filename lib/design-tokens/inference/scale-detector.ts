/**
 * REQ-52 Task 2: Spacing scale detector.
 *
 * Analyses spacing tokens for common mathematical progressions
 * (e.g. 4 → 8 → 16 → 32 with ratio 2).
 */

import type { ExtractedToken, ScalePattern } from '../types';
import { extractNumericValue } from './token-grouping';

// ---------------------------------------------------------------------------
// Well-known ratios we try to match
// ---------------------------------------------------------------------------

const KNOWN_RATIOS = [
  { label: '2×', value: 2 },
  { label: '1.5×', value: 1.5 },
  { label: 'golden ratio', value: 1.618 },
  { label: '1.25×', value: 1.25 },
  { label: '3×', value: 3 },
  { label: '4×', value: 4 },
];

/** Tolerance when comparing floating-point ratios. */
const RATIO_TOLERANCE = 0.15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect a mathematical scale pattern in a set of spacing tokens.
 *
 * 1. Extracts numeric px/rem values.
 * 2. Deduplicates and sorts ascending.
 * 3. Computes consecutive ratios and attempts to match a known progression.
 * 4. Returns the detected `ScalePattern` or `null` if no clear pattern found.
 *
 * A valid scale requires at least 3 distinct values with a consistent ratio.
 */
export function detectScalePattern(
  spacingTokens: ExtractedToken[],
): ScalePattern | null {
  // 1. Extract & deduplicate numeric values
  const numericSet = new Set<number>();
  for (const t of spacingTokens) {
    const n = extractNumericValue(t.value);
    if (n !== null && n > 0) numericSet.add(n);
  }

  const values = Array.from(numericSet).sort((a, b) => a - b);
  if (values.length < 3) return null;

  // 2. Compute consecutive ratios
  const ratios: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ratios.push(values[i] / values[i - 1]);
  }

  // 3. Try to find a known ratio that matches the majority of steps
  for (const known of KNOWN_RATIOS) {
    const matching = ratios.filter(
      (r) => Math.abs(r - known.value) / known.value < RATIO_TOLERANCE,
    );

    // Require at least 60 % of ratios to match
    if (matching.length / ratios.length >= 0.6) {
      return {
        baseValue: values[0],
        ratio: known.value,
        values,
      };
    }
  }

  // 4. Check for a consistent custom ratio (all ratios within tolerance of the median)
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
  const allClose = ratios.every(
    (r) => Math.abs(r - medianRatio) / medianRatio < RATIO_TOLERANCE,
  );

  if (allClose) {
    return {
      baseValue: values[0],
      ratio: Math.round(medianRatio * 1000) / 1000,
      values,
    };
  }

  return null;
}
