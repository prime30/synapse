/**
 * REQ-52: Design System Analysis & Token Management
 * Extracts design tokens (colors, fonts, spacing, etc.) from CSS, Liquid, and JSON theme files.
 */

import type { DesignTokens } from './types';
import { emptyTokens } from './types';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Hex colors: #rgb, #rrggbb, #rrggbbaa */
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;

/** rgb() / rgba() / hsl() / hsla() */
const FUNC_COLOR = /(?:rgba?|hsla?)\([^)]+\)/g;

/** CSS custom-property references that look like colors: var(--color-*), var(--bg-*), etc. */
const VAR_COLOR = /var\(--(?:color|bg|text|border|accent|brand|primary|secondary|success|warning|error|danger|info|surface|foreground|background)[^)]*\)/gi;

/** font-family declarations */
const FONT_FAMILY = /font-family\s*:\s*([^;}{]+)/gi;

/** font-size declarations */
const FONT_SIZE = /font-size\s*:\s*([^;}{]+)/gi;

/** margin / padding / gap declarations */
const SPACING = /(?:margin|padding|gap)\s*:\s*([^;}{]+)/gi;

/** border-radius declarations */
const BORDER_RADIUS = /border-radius\s*:\s*([^;}{]+)/gi;

/** box-shadow declarations */
const BOX_SHADOW = /box-shadow\s*:\s*([^;}{]+)/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deduplicate and sort an array of strings. */
function dedup(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].sort();
}

/** Clean a CSS value: trim, collapse whitespace. */
function clean(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

/**
 * Extract all regex matches from content.
 * Returns the full match or a specific capture group.
 */
function allMatches(content: string, regex: RegExp, group = 0): string[] {
  const results: string[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const val = m[group];
    if (val) results.push(clean(val));
  }
  return results;
}

// ---------------------------------------------------------------------------
// CSS / Liquid extraction
// ---------------------------------------------------------------------------

/**
 * Extract design tokens from CSS (or Liquid containing CSS / <style> blocks).
 */
export function extractFromCSS(content: string): DesignTokens {
  const tokens = emptyTokens();

  // Colors
  tokens.colors.push(
    ...allMatches(content, HEX_COLOR),
    ...allMatches(content, FUNC_COLOR),
    ...allMatches(content, VAR_COLOR),
  );

  // Fonts
  tokens.fonts.push(...allMatches(content, FONT_FAMILY, 1));

  // Font sizes
  tokens.fontSizes.push(...allMatches(content, FONT_SIZE, 1));

  // Spacing
  const rawSpacing = allMatches(content, SPACING, 1);
  for (const val of rawSpacing) {
    // Split compound values like "10px 20px 10px 20px" into individual values
    const parts = val.split(/\s+/).filter(Boolean);
    tokens.spacing.push(...parts);
  }

  // Border radius
  tokens.radii.push(...allMatches(content, BORDER_RADIUS, 1));

  // Shadows
  tokens.shadows.push(...allMatches(content, BOX_SHADOW, 1));

  return dedupTokens(tokens);
}

// ---------------------------------------------------------------------------
// JSON extraction (Shopify settings_schema.json / settings_data.json)
// ---------------------------------------------------------------------------

interface ShopifySetting {
  type?: string;
  id?: string;
  default?: unknown;
  label?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  unit?: string;
}

/**
 * Extract design tokens from Shopify settings JSON (settings_schema.json).
 * Walks the JSON looking for settings with type "color", "font_picker", "range", etc.
 */
export function extractFromJSON(content: string): DesignTokens {
  const tokens = emptyTokens();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return tokens;
  }

  const settings: ShopifySetting[] = [];
  collectSettings(parsed, settings);

  for (const setting of settings) {
    switch (setting.type) {
      case 'color':
      case 'color_background':
        if (typeof setting.default === 'string' && setting.default) {
          tokens.colors.push(setting.default);
        }
        break;

      case 'font_picker':
      case 'font':
        if (typeof setting.default === 'string' && setting.default) {
          tokens.fonts.push(setting.default);
        }
        break;

      case 'range':
        if (setting.unit === 'px' && typeof setting.default === 'number') {
          // Could be spacing, font-size, or border-radius depending on the setting id
          const val = `${setting.default}px`;
          const id = (setting.id ?? '').toLowerCase();
          if (id.includes('radius')) {
            tokens.radii.push(val);
          } else if (id.includes('font') || id.includes('size')) {
            tokens.fontSizes.push(val);
          } else {
            tokens.spacing.push(val);
          }
        }
        break;
    }
  }

  return dedupTokens(tokens);
}

/** Recursively walk JSON to collect objects that look like Shopify settings. */
function collectSettings(obj: unknown, out: ShopifySetting[]): void {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectSettings(item, out);
    }
    return;
  }
  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (typeof record.type === 'string' && typeof record.id === 'string') {
      out.push(record as unknown as ShopifySetting);
    }
    for (const value of Object.values(record)) {
      collectSettings(value, out);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** File type hint for the extractor. */
export type TokenFileType = 'css' | 'liquid' | 'json';

/**
 * Extract design tokens from file content.
 * Automatically selects the right strategy based on fileType.
 */
export function extractTokens(content: string, fileType: TokenFileType): DesignTokens {
  switch (fileType) {
    case 'css':
    case 'liquid':
      return extractFromCSS(content);
    case 'json':
      return extractFromJSON(content);
    default:
      return emptyTokens();
  }
}

/**
 * Merge multiple DesignTokens objects into one, deduplicating values.
 */
export function mergeTokens(...tokenSets: DesignTokens[]): DesignTokens {
  const merged = emptyTokens();
  for (const t of tokenSets) {
    merged.colors.push(...t.colors);
    merged.fonts.push(...t.fonts);
    merged.fontSizes.push(...t.fontSizes);
    merged.spacing.push(...t.spacing);
    merged.radii.push(...t.radii);
    merged.shadows.push(...t.shadows);
  }
  return dedupTokens(merged);
}

/** Deduplicate all fields in a DesignTokens object. */
function dedupTokens(tokens: DesignTokens): DesignTokens {
  return {
    colors: dedup(tokens.colors),
    fonts: dedup(tokens.fonts),
    fontSizes: dedup(tokens.fontSizes),
    spacing: dedup(tokens.spacing),
    radii: dedup(tokens.radii),
    shadows: dedup(tokens.shadows),
  };
}
