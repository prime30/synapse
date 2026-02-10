/**
 * REQ-52 Task 2: Token naming suggester.
 *
 * Examines an extracted token's value and surrounding context to propose
 * a human-friendly, industry-standard design-token name.
 */

import type { ExtractedToken, NameSuggestion } from '../types';
import { hexToRgb, rgbStringToRgb } from './token-grouping';

// ---------------------------------------------------------------------------
// Semantic keyword → token-name mappings
// ---------------------------------------------------------------------------

/** Context keywords that map to well-known semantic roles. */
const SEMANTIC_KEYWORDS: [RegExp, string][] = [
  // Colours – role
  [/\bprimary\b/i, 'primary'],
  [/\bsecondary\b/i, 'secondary'],
  [/\baccent\b/i, 'accent'],
  [/\bsuccess\b/i, 'success'],
  [/\bwarning\b/i, 'warning'],
  [/\berror\b/i, 'error'],
  [/\bdanger\b/i, 'error'],
  [/\binfo\b/i, 'info'],
  [/\bmuted\b/i, 'muted'],
  [/\bdisabled\b/i, 'disabled'],

  // UI components
  [/\bbtn|button\b/i, 'button'],
  [/\bheader\b/i, 'header'],
  [/\bfooter\b/i, 'footer'],
  [/\bnav(bar|igation)?\b/i, 'nav'],
  [/\bcard\b/i, 'card'],
  [/\bmodal\b/i, 'modal'],
  [/\bhero\b/i, 'hero'],
  [/\bbanner\b/i, 'banner'],
  [/\bsidebar\b/i, 'sidebar'],
  [/\bbadge\b/i, 'badge'],
  [/\binput\b/i, 'input'],

  // Surface / role
  [/\bbackground|bg\b/i, 'background'],
  [/\bforeground|fg\b/i, 'foreground'],
  [/\bsurface\b/i, 'surface'],
  [/\bborder\b/i, 'border'],
  [/\btext\b/i, 'text'],
  [/\blink\b/i, 'link'],
  [/\bheading\b/i, 'heading'],
  [/\bbody\b/i, 'body'],
  [/\bcaption\b/i, 'caption'],
  [/\blabel\b/i, 'label'],
  [/\bplaceholder\b/i, 'placeholder'],

  // State
  [/\bhover\b/i, 'hover'],
  [/\bactive\b/i, 'active'],
  [/\bfocus\b/i, 'focus'],
];

// ---------------------------------------------------------------------------
// Colour shade helper
// ---------------------------------------------------------------------------

function inferColorShade(value: string): string | null {
  const rgb = hexToRgb(value) ?? rgbStringToRgb(value);
  if (!rgb) return null;
  const lightness = (rgb.r + rgb.g + rgb.b) / 3;
  if (lightness > 220) return 'lightest';
  if (lightness > 180) return 'light';
  if (lightness > 80) return '';        // mid-range — no qualifier
  if (lightness > 40) return 'dark';
  return 'darkest';
}

// ---------------------------------------------------------------------------
// Category prefix helpers
// ---------------------------------------------------------------------------

const CATEGORY_PREFIX: Record<string, string> = {
  color: 'color',
  typography: 'font',
  spacing: 'spacing',
  shadow: 'shadow',
  border: 'border',
  animation: 'animation',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Suggest a design-token name for the given extracted token.
 *
 * Heuristic priority:
 *   1. If the token already has a meaningful `name`, normalise and reuse it.
 *   2. Search `context` for semantic keywords (primary, btn, header, …).
 *   3. For colours, append shade qualifiers (light / dark).
 *   4. Fall back to a generic `category-N` name with low confidence.
 *
 * `existingNames` is used to avoid duplicates (appends a numeric suffix).
 */
export function suggestTokenName(
  token: ExtractedToken,
  existingNames: string[],
): NameSuggestion {
  const prefix = CATEGORY_PREFIX[token.category] ?? token.category;
  const contextLower = (token.context + ' ' + (token.name ?? '')).toLowerCase();

  // ------ 1. If the token already has a semantic name, normalise it ------
  if (token.name) {
    const cleaned = token.name
      .replace(/^--|^settings\./i, '')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();

    if (cleaned.length > 1 && !/^[0-9]/.test(cleaned)) {
      const finalName = dedup(`${prefix}-${cleaned}`, existingNames);
      return {
        name: finalName,
        confidence: 0.9,
        reasoning: `Reused existing token name "${token.name}".`,
      };
    }
  }

  // ------ 2. Search context for semantic hints ------
  const matchedSegments: string[] = [];
  for (const [pattern, label] of SEMANTIC_KEYWORDS) {
    if (pattern.test(contextLower)) {
      matchedSegments.push(label);
    }
  }

  if (matchedSegments.length > 0) {
    // Take at most 2 segments (e.g. "button-primary")
    const slug = matchedSegments.slice(0, 2).join('-');
    let name = `${prefix}-${slug}`;

    // For colours, append shade qualifier
    if (token.category === 'color') {
      const shade = inferColorShade(token.value);
      if (shade) name += `-${shade}`;
    }

    const finalName = dedup(name, existingNames);
    return {
      name: finalName,
      confidence: matchedSegments.length >= 2 ? 0.85 : 0.7,
      reasoning: `Inferred from context keywords: ${matchedSegments.join(', ')}.`,
    };
  }

  // ------ 3. Colour shade only ------
  if (token.category === 'color') {
    const shade = inferColorShade(token.value);
    if (shade) {
      const finalName = dedup(`${prefix}-${shade}`, existingNames);
      return {
        name: finalName,
        confidence: 0.4,
        reasoning: `No semantic context; inferred shade "${shade}" from colour value.`,
      };
    }
  }

  // ------ 4. Generic fallback ------
  const fallback = dedup(`${prefix}-value`, existingNames);
  return {
    name: fallback,
    confidence: 0.2,
    reasoning: 'No semantic context found; using generic name.',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure `candidate` is unique within `existing`, appending `-N` if needed. */
function dedup(candidate: string, existing: string[]): string {
  if (!existing.includes(candidate)) return candidate;
  let i = 2;
  while (existing.includes(`${candidate}-${i}`)) i++;
  return `${candidate}-${i}`;
}
