/**
 * Phase 5a: Color ramp generator for design system tokens.
 * Uses culori for perceptually uniform ramp generation in oklch space.
 */

import {
  converter,
  formatHex,
  wcagContrast,
  parse,
} from 'culori';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorRampEntry {
  step: number;
  hex: string;
  oklch: { l: number; c: number; h: number };
  contrastOnWhite: number;
  contrastOnBlack: number;
}

export interface BrandColor {
  name: string;
  value: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Lightness anchors (Tailwind-style scale)
// ---------------------------------------------------------------------------

const LIGHTNESS_ANCHORS: Record<number, number> = {
  50: 0.97,
  100: 0.93,
  200: 0.87,
  300: 0.78,
  400: 0.67,
  500: 0.55,
  600: 0.45,
  700: 0.37,
  800: 0.28,
  900: 0.2,
  950: 0.14,
};

const STANDARD_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// ---------------------------------------------------------------------------
// Color validation
// ---------------------------------------------------------------------------

/** Check if a string looks like a valid color (hex, rgb, hsl). */
function isValidColorValue(value: string): boolean {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed))
    return true;
  if (/^rgba?\([^)]+\)$/.test(trimmed)) return true;
  if (/^hsla?\([^)]+\)$/.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Brand color heuristics
// ---------------------------------------------------------------------------

const BRAND_KEYWORDS = [
  'primary',
  'accent',
  'secondary',
  'brand',
  'button',
  'cta',
];

/** Dawn theme: color_schemes.*.settings.background, color_schemes.*.settings.button */
const DAWN_PATTERN =
  /^color_schemes\.[^.]+\.settings\.(background|button|text|accent)/i;

/** T4S theme: primary_color, second_color, accent_color */
const T4S_PATTERN = /^(primary_color|second_color|accent_color)$/i;

function isBrandColorName(name: string): boolean {
  const lower = name.toLowerCase();
  if (BRAND_KEYWORDS.some((k) => lower.includes(k))) return true;
  if (DAWN_PATTERN.test(name)) return true;
  if (T4S_PATTERN.test(name)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a perceptually uniform color ramp from a base color in oklch space.
 * Preserves chroma and hue; varies only lightness.
 *
 * @param baseColor  Hex, rgb, or hsl color string.
 * @param steps     Optional number of steps (default: all 11 standard steps).
 * @returns Array of ramp entries with hex, oklch, and WCAG contrast ratios.
 */
export function generateColorRamp(
  baseColor: string,
  steps?: number,
): ColorRampEntry[] {
  const toOklch = converter('oklch');
  const parsed = parse(baseColor);
  if (!parsed) return [];

  const oklchColor = toOklch(parsed);
  if (!oklchColor || typeof oklchColor.l !== 'number') return [];

  const l = Number(oklchColor.l);
  const c = Number(oklchColor.c ?? 0);
  const h = Number(oklchColor.h ?? 0);

  const stepValues =
    steps !== undefined
      ? STANDARD_STEPS.filter((_, i) => i < steps)
      : STANDARD_STEPS;

  const white = '#ffffff';
  const black = '#000000';

  const result: ColorRampEntry[] = [];

  for (const step of stepValues) {
    const targetL = LIGHTNESS_ANCHORS[step];
    const color = {
      mode: 'oklch' as const,
      l: targetL,
      c,
      h,
    };
    const hex = formatHex(color);
    const contrastWhite = wcagContrast(hex, white) ?? 0;
    const contrastBlack = wcagContrast(hex, black) ?? 0;

    result.push({
      step,
      hex,
      oklch: { l: targetL, c, h },
      contrastOnWhite: contrastWhite,
      contrastOnBlack: contrastBlack,
    });
  }

  return result;
}

/**
 * Identify brand/semantic colors from a token list using heuristics.
 * Matches: primary, accent, secondary, brand, button, cta;
 * Dawn patterns: color_schemes.*.settings.background|button;
 * T4S patterns: primary_color, second_color, accent_color.
 *
 * @param tokens  Tokens with name, value, and optional source.
 * @returns Filtered brand colors with valid color values.
 */
export function identifyBrandColors(
  tokens: { name: string; value: string; source?: string }[],
): BrandColor[] {
  const seen = new Set<string>();

  return tokens
    .filter((t) => {
      if (!isBrandColorName(t.name)) return false;
      if (!isValidColorValue(t.value)) return false;
      const key = `${t.name}:${t.value.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((t) => ({
      name: t.name,
      value: t.value.trim(),
      source: t.source ?? '',
    }));
}
