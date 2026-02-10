/**
 * REQ-52 Task 1: CSS Parser
 * Extracts design tokens from CSS (and SCSS-like) files with source location tracking.
 */

import type { ExtractedToken, TokenCategory } from '../types';

let _nextId = 0;
function nextId(): string {
  return `css-${++_nextId}`;
}

/** Reset ID counter (for testing). */
export function resetIdCounter(): void {
  _nextId = 0;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** CSS custom properties in :root or other selectors. */
const CSS_VAR_DECL = /(--([\w-]+))\s*:\s*([^;]+)/g;

/** Hex colors */
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;

/** rgb/rgba/hsl/hsla */
const FUNC_COLOR = /(?:rgba?|hsla?)\([^)]+\)/g;

/** var(--*) references that look like color tokens */
const VAR_COLOR_REF = /var\(--(?:color|bg|text|border|accent|brand|primary|secondary|success|warning|error|danger|info|surface|foreground|background)[^)]*\)/gi;

/** Property-value patterns with capture groups: property: value; */
const PROP_PATTERNS: { prop: RegExp; category: TokenCategory; splitValues?: boolean }[] = [
  { prop: /font-family\s*:\s*([^;}{]+)/gi, category: 'typography' },
  { prop: /font-size\s*:\s*([^;}{]+)/gi, category: 'typography' },
  { prop: /font-weight\s*:\s*([^;}{]+)/gi, category: 'typography' },
  { prop: /line-height\s*:\s*([^;}{]+)/gi, category: 'typography' },
  { prop: /letter-spacing\s*:\s*([^;}{]+)/gi, category: 'typography' },
  { prop: /(?:margin|padding|gap)\s*:\s*([^;}{]+)/gi, category: 'spacing', splitValues: true },
  { prop: /border-radius\s*:\s*([^;}{]+)/gi, category: 'border' },
  { prop: /border(?:-width|-style|-color)?\s*:\s*([^;}{]+)/gi, category: 'border' },
  { prop: /box-shadow\s*:\s*([^;}{]+)/gi, category: 'shadow' },
  { prop: /text-shadow\s*:\s*([^;}{]+)/gi, category: 'shadow' },
  { prop: /transition\s*:\s*([^;}{]+)/gi, category: 'animation' },
  { prop: /animation\s*:\s*([^;}{]+)/gi, category: 'animation' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function contextAround(content: string, index: number, chars = 80): string {
  const start = Math.max(0, index - chars);
  const end = Math.min(content.length, index + chars);
  return content.slice(start, end).replace(/\n/g, ' ').trim();
}

function clean(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseCSSTokens(content: string, filePath: string): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // 1. CSS custom property declarations
  {
    const re = new RegExp(CSS_VAR_DECL.source, CSS_VAR_DECL.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const name = m[2]; // variable name without --
      const value = clean(m[3]);
      const category = inferCategory(name, value);
      tokens.push({
        id: nextId(),
        name,
        category,
        value,
        filePath,
        lineNumber: lineNumberAt(content, m.index),
        context: contextAround(content, m.index),
      });
    }
  }

  // 2. Inline hex colors (not in custom property declarations — avoid double-counting)
  {
    const re = new RegExp(HEX_COLOR.source, HEX_COLOR.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      // Skip if this hex is part of a custom property declaration we already captured
      const lineStart = content.lastIndexOf('\n', m.index) + 1;
      const line = content.slice(lineStart, content.indexOf('\n', m.index));
      if (/^\s*--[\w-]+\s*:/.test(line)) continue;

      tokens.push({
        id: nextId(),
        name: null,
        category: 'color',
        value: m[0],
        filePath,
        lineNumber: lineNumberAt(content, m.index),
        context: contextAround(content, m.index),
      });
    }
  }

  // 3. Functional colors (rgb, rgba, hsl, hsla)
  {
    const re = new RegExp(FUNC_COLOR.source, FUNC_COLOR.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const lineStart = content.lastIndexOf('\n', m.index) + 1;
      const line = content.slice(lineStart, content.indexOf('\n', m.index));
      if (/^\s*--[\w-]+\s*:/.test(line)) continue;

      tokens.push({
        id: nextId(),
        name: null,
        category: 'color',
        value: clean(m[0]),
        filePath,
        lineNumber: lineNumberAt(content, m.index),
        context: contextAround(content, m.index),
      });
    }
  }

  // 4. var(--color-*) references
  {
    const re = new RegExp(VAR_COLOR_REF.source, VAR_COLOR_REF.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      tokens.push({
        id: nextId(),
        name: null,
        category: 'color',
        value: clean(m[0]),
        filePath,
        lineNumber: lineNumberAt(content, m.index),
        context: contextAround(content, m.index),
      });
    }
  }

  // 5. Property-based extraction (spacing, typography, shadows, borders, animation)
  for (const { prop, category, splitValues } of PROP_PATTERNS) {
    const re = new RegExp(prop.source, prop.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const rawValue = clean(m[1]);
      if (splitValues) {
        const parts = rawValue.split(/\s+/).filter(Boolean);
        for (const part of parts) {
          tokens.push({
            id: nextId(),
            name: null,
            category,
            value: part,
            filePath,
            lineNumber: lineNumberAt(content, m.index),
            context: contextAround(content, m.index),
          });
        }
      } else {
        tokens.push({
          id: nextId(),
          name: null,
          category,
          value: rawValue,
          filePath,
          lineNumber: lineNumberAt(content, m.index),
          context: contextAround(content, m.index),
        });
      }
    }
  }

  return tokens;
}

/** Infer token category from a CSS custom property name and value. */
function inferCategory(name: string, value: string): TokenCategory {
  const n = name.toLowerCase();
  if (/color|bg|text|border-color|accent|brand|primary|secondary/.test(n)) return 'color';
  if (/font|text-size|line-height|letter-spacing|weight/.test(n)) return 'typography';
  if (/spacing|margin|padding|gap|gutter/.test(n)) return 'spacing';
  if (/shadow/.test(n)) return 'shadow';
  if (/border|radius/.test(n)) return 'border';
  if (/animation|transition|duration|ease|delay/.test(n)) return 'animation';

  // Fallback: infer from value
  if (/^#|^rgb|^hsl/.test(value)) return 'color';
  if (/px|rem|em|%|vw|vh/.test(value)) return 'spacing';
  return 'color';
}
