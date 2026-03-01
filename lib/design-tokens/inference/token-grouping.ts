/**
 * REQ-52 Task 2: Token grouping algorithm.
 *
 * Groups extracted tokens by similarity within each category:
 *   - Colors   → CIEDE2000 perceptual distance clustering (deltaE ~20 = near match)
 *   - Spacing  → Numeric-value proximity grouping
 *   - Typography → Font-family grouping
 *   - Other    → Exact-value grouping
 */

import { differenceCiede2000, parse } from 'culori';
import type { ExtractedToken, TokenCategory, TokenGroup } from '../types';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Convert a CSS hex colour (#rgb or #rrggbb) to an RGB triple.
 * Returns null when the value is not a recognisable hex colour.
 */
export function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.trim();
  const match3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(cleaned);
  if (match3) {
    return {
      r: parseInt(match3[1] + match3[1], 16),
      g: parseInt(match3[2] + match3[2], 16),
      b: parseInt(match3[3] + match3[3], 16),
    };
  }
  const match6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(cleaned);
  if (match6) {
    return {
      r: parseInt(match6[1], 16),
      g: parseInt(match6[2], 16),
      b: parseInt(match6[3], 16),
    };
  }
  return null;
}

/**
 * Parse `rgb(r, g, b)` or `rgba(r, g, b, a)` to an RGB triple.
 */
export function rgbStringToRgb(value: string): RGB | null {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

/** Colour distance using CIEDE2000 (perceptually uniform). Re-exported for tests. */
export function colorDistance(a: RGB, b: RGB): number {
  const deltaE = differenceCiede2000();
  const rgbA = parse(`rgb(${a.r},${a.g},${a.b})`);
  const rgbB = parse(`rgb(${b.r},${b.g},${b.b})`);
  return deltaE(rgbA, rgbB) ?? Infinity;
}

/** Try to parse any supported colour string to RGB. */
function parseColor(value: string): RGB | null {
  return hexToRgb(value) ?? rgbStringToRgb(value);
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Extract a numeric pixel/rem value from a token value string. */
export function extractNumericValue(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)\s*(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2] ?? 'px';
  // Normalise rem/em to px (assume 16px base) for grouping purposes.
  if (unit === 'rem' || unit === 'em') return num * 16;
  return num;
}

// ---------------------------------------------------------------------------
// Colour description helper
// ---------------------------------------------------------------------------

function describeColorGroup(rgbs: RGB[]): string {
  if (rgbs.length === 0) return 'colors';
  const avg = {
    r: Math.round(rgbs.reduce((s, c) => s + c.r, 0) / rgbs.length),
    g: Math.round(rgbs.reduce((s, c) => s + c.g, 0) / rgbs.length),
    b: Math.round(rgbs.reduce((s, c) => s + c.b, 0) / rgbs.length),
  };
  // Determine dominant channel
  const max = Math.max(avg.r, avg.g, avg.b);
  const brightness = (avg.r + avg.g + avg.b) / 3;
  if (brightness < 40) return 'dark / near-black colors';
  if (brightness > 220) return 'light / near-white colors';

  if (avg.r === max && avg.r > avg.g + 30 && avg.r > avg.b + 30) return 'shades of red';
  if (avg.g === max && avg.g > avg.r + 30 && avg.g > avg.b + 30) return 'shades of green';
  if (avg.b === max && avg.b > avg.r + 30 && avg.b > avg.g + 30) return 'shades of blue';
  if (avg.r > 180 && avg.g > 180 && avg.b < 100) return 'shades of yellow';
  if (avg.r > 180 && avg.b > 100 && avg.g < 100) return 'shades of purple';
  if (avg.r < 100 && avg.g > 150 && avg.b > 150) return 'shades of cyan';
  return 'mixed colors';
}

// ---------------------------------------------------------------------------
// Grouping strategies per category
// ---------------------------------------------------------------------------

/** CIEDE2000 deltaE ~20 = near match for clustering. */
const COLOR_DISTANCE_THRESHOLD = 20;

function groupColors(tokens: ExtractedToken[]): TokenGroup[] {
  const deltaE = differenceCiede2000();

  // Build (token, rgb) pairs; tokens without parseable colours form a single fallback group.
  const parseable: { token: ExtractedToken; rgb: RGB }[] = [];
  const unparseable: ExtractedToken[] = [];

  for (const t of tokens) {
    const rgb = parseColor(t.value);
    if (rgb) parseable.push({ token: t, rgb });
    else unparseable.push(t);
  }

  // Simple greedy clustering using CIEDE2000
  const clusters: { tokens: ExtractedToken[]; rgbs: RGB[] }[] = [];

  for (const { token, rgb } of parseable) {
    let placed = false;
    for (const cluster of clusters) {
      const centroid: RGB = {
        r: Math.round(cluster.rgbs.reduce((s, c) => s + c.r, 0) / cluster.rgbs.length),
        g: Math.round(cluster.rgbs.reduce((s, c) => s + c.g, 0) / cluster.rgbs.length),
        b: Math.round(cluster.rgbs.reduce((s, c) => s + c.b, 0) / cluster.rgbs.length),
      };
      const d = colorDistance(rgb, centroid);
      if (d < COLOR_DISTANCE_THRESHOLD) {
        cluster.tokens.push(token);
        cluster.rgbs.push(rgb);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ tokens: [token], rgbs: [rgb] });
    }
  }

  const groups: TokenGroup[] = clusters.map((c, i) => ({
    id: `color-group-${i + 1}`,
    tokens: c.tokens,
    category: 'color' as TokenCategory,
    pattern: describeColorGroup(c.rgbs),
  }));

  if (unparseable.length > 0) {
    groups.push({
      id: `color-group-unparseable`,
      tokens: unparseable,
      category: 'color',
      pattern: 'colors (dynamic / unparseable values)',
    });
  }

  return groups;
}

function groupSpacing(tokens: ExtractedToken[]): TokenGroup[] {
  // Group by similar numeric value (within 2px)
  const withValue: { token: ExtractedToken; num: number }[] = [];
  const noValue: ExtractedToken[] = [];

  for (const t of tokens) {
    const n = extractNumericValue(t.value);
    if (n !== null) withValue.push({ token: t, num: n });
    else noValue.push(t);
  }

  // Sort and cluster by proximity
  withValue.sort((a, b) => a.num - b.num);

  const clusters: { tokens: ExtractedToken[]; values: number[] }[] = [];
  for (const { token, num } of withValue) {
    const last = clusters[clusters.length - 1];
    if (last) {
      const avg = last.values.reduce((s, v) => s + v, 0) / last.values.length;
      if (Math.abs(num - avg) <= 2) {
        last.tokens.push(token);
        last.values.push(num);
        continue;
      }
    }
    clusters.push({ tokens: [token], values: [num] });
  }

  const groups: TokenGroup[] = clusters.map((c, i) => {
    const avg = Math.round(c.values.reduce((s, v) => s + v, 0) / c.values.length);
    return {
      id: `spacing-group-${i + 1}`,
      tokens: c.tokens,
      category: 'spacing' as TokenCategory,
      pattern: `~${avg}px spacing values`,
    };
  });

  if (noValue.length > 0) {
    groups.push({
      id: `spacing-group-other`,
      tokens: noValue,
      category: 'spacing',
      pattern: 'non-numeric spacing values',
    });
  }

  return groups;
}

function groupTypography(tokens: ExtractedToken[]): TokenGroup[] {
  // Group by font-family (if parseable), else by value
  const familyMap = new Map<string, ExtractedToken[]>();

  for (const t of tokens) {
    // Extract primary family name
    const family = t.value
      .split(',')[0]
      .trim()
      .replace(/['"]/g, '')
      .toLowerCase() || '__size__';
    const key = /^\d/.test(family) ? '__size__' : family;
    if (!familyMap.has(key)) familyMap.set(key, []);
    familyMap.get(key)!.push(t);
  }

  let idx = 0;
  const groups: TokenGroup[] = [];
  for (const [family, toks] of familyMap) {
    idx++;
    groups.push({
      id: `typography-group-${idx}`,
      tokens: toks,
      category: 'typography',
      pattern:
        family === '__size__'
          ? 'font sizes'
          : `${family} font family`,
    });
  }
  return groups;
}

function groupGeneric(tokens: ExtractedToken[], category: TokenCategory): TokenGroup[] {
  // Group by exact value
  const byValue = new Map<string, ExtractedToken[]>();
  for (const t of tokens) {
    if (!byValue.has(t.value)) byValue.set(t.value, []);
    byValue.get(t.value)!.push(t);
  }

  let idx = 0;
  const groups: TokenGroup[] = [];
  for (const [value, toks] of byValue) {
    idx++;
    groups.push({
      id: `${category}-group-${idx}`,
      tokens: toks,
      category,
      pattern: `${category}: ${value}`,
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group extracted tokens by similarity.
 *
 * Dispatches to a category-specific strategy:
 *   color      → RGB distance clustering
 *   spacing    → numeric proximity
 *   typography → font-family bucketing
 *   others     → exact-value bucketing
 */
export function groupSimilarValues(tokens: ExtractedToken[]): TokenGroup[] {
  // Partition tokens by category
  const byCategory = new Map<TokenCategory, ExtractedToken[]>();
  for (const t of tokens) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }

  const groups: TokenGroup[] = [];

  for (const [category, categoryTokens] of byCategory) {
    switch (category) {
      case 'color':
        groups.push(...groupColors(categoryTokens));
        break;
      case 'spacing':
        groups.push(...groupSpacing(categoryTokens));
        break;
      case 'typography':
        groups.push(...groupTypography(categoryTokens));
        break;
      default:
        groups.push(...groupGeneric(categoryTokens, category));
        break;
    }
  }

  return groups;
}
