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

// ---------------------------------------------------------------------------
// Typographic scale detection (Phase 10a)
// ---------------------------------------------------------------------------

/** Result of typographic scale detection (modular scale: baseSize * ratio^n). */
export interface TypographicScaleResult {
  ratio: number;
  baseSize: number;
  values: number[];
}

/** Known modular scale ratios for typography (order: more specific before similar). */
const TYPO_RATIOS = [
  { label: '1.25 (major third)', value: 1.25 },
  { label: '1.5 (perfect fifth)', value: 1.5 },
  { label: '1.2 (minor third)', value: 1.2 },
  { label: '1.333 (perfect fourth)', value: 1.333 },
  { label: '1.414 (augmented fourth)', value: 1.414 },
  { label: '1.125 (minor second)', value: 1.125 },
  { label: '1.618 (golden)', value: 1.618 },
  { label: '2', value: 2 },
];

const TYPO_RATIO_TOLERANCE = 0.12;

/**
 * Detect a typographic (modular) scale from font-size values.
 * E.g. 1.25 scale: 12, 15, 18.75, 23.4, 29.3
 *
 * @param fontSizes Numeric font sizes (px or rem converted to px).
 * @returns Detected scale or null if no clear pattern.
 */
export function detectTypographicScale(
  fontSizes: number[],
): TypographicScaleResult | null {
  const values = [...new Set(fontSizes)]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (values.length < 3) return null;

  // Try each known ratio: find base such that values ≈ base * ratio^n
  for (const known of TYPO_RATIOS) {
    const ratio = known.value;
    // Pick smallest value as candidate base
    const base = values[0];
    let matches = 0;
    for (let i = 0; i < values.length; i++) {
      const expected = base * Math.pow(ratio, i);
      const actual = values[i];
      const relErr = Math.abs(actual - expected) / expected;
      if (relErr < TYPO_RATIO_TOLERANCE) matches++;
    }
    if (matches / values.length >= 0.6) {
      return { ratio, baseSize: base, values };
    }
  }

  // Try inferred ratio from consecutive pairs
  const ratios: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ratios.push(values[i] / values[i - 1]);
  }
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
  const allClose = ratios.every(
    (r) => Math.abs(r - medianRatio) / medianRatio < TYPO_RATIO_TOLERANCE,
  );
  if (allClose) {
    return {
      ratio: Math.round(medianRatio * 1000) / 1000,
      baseSize: values[0],
      values,
    };
  }
  return null;
}
