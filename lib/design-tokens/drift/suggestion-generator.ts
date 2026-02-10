/**
 * REQ-52 Task 6: Tokenisation suggestion generator.
 *
 * For each hardcoded value found via drift detection, find the closest
 * matching design token and produce a concrete replacement suggestion.
 */

import type { TokenCategory } from '../types';
import type { DriftItem, TokenizationSuggestion } from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StoredTokenSummary {
  name: string;
  value: string;
  category: string;
}

/**
 * Generate tokenisation suggestions for a set of drift items.
 *
 * @param driftItems  Hardcoded values found during extraction.
 * @param existingTokens  Stored design tokens for the project.
 * @returns Suggestions ordered by confidence (highest first).
 */
export function generateSuggestions(
  driftItems: DriftItem[],
  existingTokens: StoredTokenSummary[],
): TokenizationSuggestion[] {
  if (existingTokens.length === 0) return [];

  const suggestions: TokenizationSuggestion[] = [];

  for (const item of driftItems) {
    const best = findBestMatch(item, existingTokens);
    if (best) {
      suggestions.push(best);
    }
  }

  // Highest confidence first
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions;
}

// ---------------------------------------------------------------------------
// Match logic
// ---------------------------------------------------------------------------

/** Minimum confidence threshold to emit a suggestion. */
const MIN_CONFIDENCE = 0.3;

function findBestMatch(
  item: DriftItem,
  tokens: StoredTokenSummary[],
): TokenizationSuggestion | null {
  let bestConfidence = 0;
  let bestToken: StoredTokenSummary | null = null;
  let bestReason = '';

  for (const token of tokens) {
    // Only compare tokens in the same (or compatible) category
    if (!categoriesCompatible(item.category, token.category)) continue;

    const { confidence, reason } = computeConfidence(
      item.value,
      token.value,
      item.category,
    );

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestToken = token;
      bestReason = reason;
    }
  }

  if (!bestToken || bestConfidence < MIN_CONFIDENCE) return null;

  return {
    hardcodedValue: item.value,
    lineNumber: item.lineNumber,
    suggestedToken: bestToken.name,
    suggestedReplacement: buildReplacement(bestToken.name, item.context),
    confidence: bestConfidence,
    reason: bestReason,
  };
}

// ---------------------------------------------------------------------------
// Category compatibility
// ---------------------------------------------------------------------------

function categoriesCompatible(a: TokenCategory, b: string): boolean {
  if (a === b) return true;
  // Allow border↔spacing comparison (e.g. border-radius vs spacing scale)
  const numericCategories = new Set(['spacing', 'border', 'typography']);
  return numericCategories.has(a) && numericCategories.has(b);
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(
  hardcoded: string,
  tokenValue: string,
  category: TokenCategory,
): { confidence: number; reason: string } {
  // Exact match (case-insensitive for colours)
  if (normalise(hardcoded) === normalise(tokenValue)) {
    return { confidence: 1.0, reason: 'Exact value match' };
  }

  switch (category) {
    case 'color':
      return colorConfidence(hardcoded, tokenValue);
    case 'spacing':
    case 'border':
    case 'typography':
      return numericConfidence(hardcoded, tokenValue);
    default:
      return { confidence: 0, reason: '' };
  }
}

// ---------------------------------------------------------------------------
// Colour comparison (RGB Euclidean distance)
// ---------------------------------------------------------------------------

function colorConfidence(
  a: string,
  b: string,
): { confidence: number; reason: string } {
  const rgbA = parseColor(a);
  const rgbB = parseColor(b);
  if (!rgbA || !rgbB) return { confidence: 0, reason: '' };

  const distance = Math.sqrt(
    (rgbA[0] - rgbB[0]) ** 2 +
    (rgbA[1] - rgbB[1]) ** 2 +
    (rgbA[2] - rgbB[2]) ** 2,
  );

  // Max possible distance in RGB space ≈ 441.67
  // We treat anything under 30 as a near-match (within ~7% perceptual difference)
  if (distance === 0) return { confidence: 1.0, reason: 'Exact color match' };
  if (distance <= 10) return { confidence: 0.9, reason: `Very similar color (RGB distance ${distance.toFixed(1)})` };
  if (distance <= 30) return { confidence: 0.7, reason: `Similar color (RGB distance ${distance.toFixed(1)})` };
  if (distance <= 60) return { confidence: 0.4, reason: `Approximate color (RGB distance ${distance.toFixed(1)})` };
  return { confidence: 0, reason: '' };
}

/** Parse a hex colour (#RGB, #RRGGBB) or rgb(r,g,b) into [r,g,b]. */
export function parseColor(raw: string): [number, number, number] | null {
  const trimmed = raw.trim().toLowerCase();

  // Hex
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    // 3-digit shorthand → 6-digit
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    // 4-digit (with alpha shorthand) → use first 3 pairs
    if (hex.length === 4) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1], 10),
      parseInt(rgbMatch[2], 10),
      parseInt(rgbMatch[3], 10),
    ];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Numeric comparison (spacing, typography, border)
// ---------------------------------------------------------------------------

function numericConfidence(
  a: string,
  b: string,
): { confidence: number; reason: string } {
  const numA = parseNumeric(a);
  const numB = parseNumeric(b);
  if (numA === null || numB === null) return { confidence: 0, reason: '' };

  if (numA === numB) return { confidence: 1.0, reason: 'Exact numeric match' };

  const diff = Math.abs(numA - numB);
  const maxVal = Math.max(Math.abs(numA), Math.abs(numB), 1);
  const ratio = diff / maxVal;

  if (ratio <= 0.05) return { confidence: 0.85, reason: `Very close value (${diff.toFixed(1)}px difference)` };
  if (ratio <= 0.15) return { confidence: 0.6, reason: `Close value (${diff.toFixed(1)}px difference)` };
  if (ratio <= 0.3) return { confidence: 0.35, reason: `Approximate value (${diff.toFixed(1)}px difference)` };
  return { confidence: 0, reason: '' };
}

/** Extract a numeric value from strings like "16px", "1.5rem", "24", etc. */
function parseNumeric(raw: string): number | null {
  const match = raw.trim().match(/^(-?[\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Replacement string builder
// ---------------------------------------------------------------------------

/**
 * Build a replacement string appropriate for the file context.
 *
 * - Liquid context → `{{ settings.token_name }}`
 * - CSS/default   → `var(--token-name)`
 */
function buildReplacement(tokenName: string, context: string): string {
  const isLiquid =
    context.includes('{{') ||
    context.includes('{%') ||
    context.includes('| ') ||
    context.includes('assign ');

  if (isLiquid) {
    // Liquid settings use underscores
    const settingName = tokenName.replace(/-/g, '_');
    return `{{ settings.${settingName} }}`;
  }

  // CSS custom properties use hyphens
  const cssName = tokenName.replace(/_/g, '-');
  return `var(--${cssName})`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
