import type { RuleViolation } from '../static-rules';

const DEPRECATED_FILTERS: ReadonlyArray<{
  filter: string;
  message: string;
  suggestion: string;
}> = [
  {
    filter: 'color_to_rgb',
    message: 'Deprecated filter "color_to_rgb" — use CSS color functions instead',
    suggestion: 'Use CSS rgb() or color-mix() instead',
  },
  {
    filter: 'color_to_hsl',
    message: 'Deprecated filter "color_to_hsl" — use CSS color functions instead',
    suggestion: 'Use CSS hsl() instead',
  },
  {
    filter: 'color_brightness',
    message: 'Deprecated filter "color_brightness" — use CSS color functions instead',
    suggestion: 'Use CSS color-contrast() or precompute values',
  },
  {
    filter: 'color_modify',
    message: 'Deprecated filter "color_modify" — use CSS color functions instead',
    suggestion: 'Use CSS color-mix() instead',
  },
  {
    filter: 'color_lighten',
    message: 'Deprecated filter "color_lighten" — use CSS color functions instead',
    suggestion: 'Use CSS color-mix() with white instead',
  },
  {
    filter: 'color_darken',
    message: 'Deprecated filter "color_darken" — use CSS color functions instead',
    suggestion: 'Use CSS color-mix() with black instead',
  },
  {
    filter: 'color_saturate',
    message: 'Deprecated filter "color_saturate" — use CSS instead',
    suggestion: 'Use CSS filter: saturate() instead',
  },
  {
    filter: 'color_desaturate',
    message: 'Deprecated filter "color_desaturate" — use CSS instead',
    suggestion: 'Use CSS filter: saturate() instead',
  },
  {
    filter: 'hex_to_rgba',
    message: 'Deprecated filter "hex_to_rgba" — use CSS color functions instead',
    suggestion: 'Use CSS rgba() instead',
  },
];

export function analyzeLiquid(content: string): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const lines = content.split('\n');

  // 1. Detect deprecated Shopify filters
  for (let i = 0; i < lines.length; i++) {
    for (const { filter, message, suggestion } of DEPRECATED_FILTERS) {
      const regex = new RegExp(`\\|\\s*${filter}`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(lines[i])) !== null) {
        violations.push({
          line: i + 1,
          column: match.index + 1,
          rule: 'liquid/deprecated-filter',
          message,
          originalCode: lines[i].trim(),
          suggestedCode: suggestion,
          severity: 'warning',
        });
      }
    }
  }

  // 2. Detect deeply nested if/unless blocks (>3 levels)
  let ifDepth = 0;
  const openRegex = /\{%-?\s*(?:if|unless)\b/;
  const closeRegex = /\{%-?\s*end(?:if|unless)\s*-?%\}/;

  for (let i = 0; i < lines.length; i++) {
    if (openRegex.test(lines[i])) {
      ifDepth++;
      if (ifDepth > 3) {
        violations.push({
          line: i + 1,
          column: 1,
          rule: 'liquid/deep-nesting',
          message: `Deeply nested conditional (level ${ifDepth}) — consider simplifying logic`,
          originalCode: lines[i].trim(),
          suggestedCode:
            'Extract nested conditions into assign variables or use case/when',
          severity: 'warning',
        });
      }
    }
    if (closeRegex.test(lines[i])) {
      ifDepth = Math.max(0, ifDepth - 1);
    }
  }

  // 3. Detect missing alt attributes on img tags
  for (let i = 0; i < lines.length; i++) {
    const imgRegex = /<img\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(lines[i])) !== null) {
      const attrs = match[1];
      if (!/\balt\s*=/.test(attrs)) {
        violations.push({
          line: i + 1,
          column: match.index + 1,
          rule: 'liquid/missing-alt',
          message:
            'Image tag missing "alt" attribute — required for accessibility',
          originalCode: match[0],
          suggestedCode: match[0].replace(/>$/, ' alt="{{ image.alt }}">'),
          severity: 'error',
        });
      }
    }
  }

  return violations;
}
