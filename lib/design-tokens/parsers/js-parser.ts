/**
 * REQ-52 Task 1: JavaScript Parser
 * Extracts design tokens from JS/TS files — style objects, inline colors, animation configs.
 * Uses regex-based heuristics (no AST dependency like Babel required at runtime).
 */

import type { ExtractedToken } from '../types';

let _nextId = 0;
function nextId(): string {
  return `js-${++_nextId}`;
}

export function resetIdCounter(): void {
  _nextId = 0;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Color-like string literals: '#hex', 'rgb(...)', 'hsl(...)' */
const STRING_COLOR = /['"]((#(?:[0-9a-fA-F]{3,4}){1,2})|(rgba?\([^)]+\))|(hsla?\([^)]+\)))['"\s,;)]/g;

/** Style-object color properties: color: '#fff', backgroundColor: 'red' */
const STYLE_COLOR_PROP = /(?:color|backgroundColor|background|borderColor|fill|stroke)\s*:\s*['"]([^'"]+)['"]/gi;

/** Style-object font properties */
const STYLE_FONT_PROP = /fontFamily\s*:\s*['"]([^'"]+)['"]/gi;

/** Style-object font size */
const STYLE_FONT_SIZE = /fontSize\s*:\s*['"]?([^'",;}\s]+)['"]?/gi;

/** Style-object spacing (margin, padding, gap) */
const STYLE_SPACING = /(?:margin|padding|gap|marginTop|marginBottom|marginLeft|marginRight|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*['"]?([^'",;}\s]+)['"]?/gi;

/** Style-object border radius */
const STYLE_RADIUS = /borderRadius\s*:\s*['"]?([^'",;}\s]+)['"]?/gi;

/** Style-object box shadow */
const STYLE_SHADOW = /boxShadow\s*:\s*['"]([^'"]+)['"]/gi;

/** Animation/transition duration */
const ANIM_DURATION = /(?:duration|delay|transitionDuration|animationDuration)\s*:\s*['"]?([^'",;}\s]+)['"]?/gi;

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

function execAll(content: string, regex: RegExp, group: number): { value: string; index: number }[] {
  const results: { value: string; index: number }[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const val = m[group];
    if (val) results.push({ value: clean(val), index: m.index });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseJSTokens(content: string, filePath: string): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // 1. Color property values in style objects
  for (const { value, index } of execAll(content, STYLE_COLOR_PROP, 1)) {
    tokens.push({
      id: nextId(),
      name: null,
      category: 'color',
      value,
      filePath,
      lineNumber: lineNumberAt(content, index),
      context: contextAround(content, index),
    });
  }

  // 2. Standalone string color literals (hex, rgb, hsl) not already captured above
  {
    const captured = new Set(tokens.map((t) => `${t.lineNumber}:${t.value}`));
    for (const { value, index } of execAll(content, STRING_COLOR, 1)) {
      const key = `${lineNumberAt(content, index)}:${value}`;
      if (!captured.has(key)) {
        tokens.push({
          id: nextId(),
          name: null,
          category: 'color',
          value,
          filePath,
          lineNumber: lineNumberAt(content, index),
          context: contextAround(content, index),
        });
      }
    }
  }

  // 3. Font family
  for (const { value, index } of execAll(content, STYLE_FONT_PROP, 1)) {
    tokens.push({
      id: nextId(),
      name: null,
      category: 'typography',
      value,
      filePath,
      lineNumber: lineNumberAt(content, index),
      context: contextAround(content, index),
    });
  }

  // 4. Font size
  for (const { value, index } of execAll(content, STYLE_FONT_SIZE, 1)) {
    if (/^\d/.test(value) || value.includes('rem') || value.includes('px') || value.includes('em')) {
      tokens.push({
        id: nextId(),
        name: null,
        category: 'typography',
        value,
        filePath,
        lineNumber: lineNumberAt(content, index),
        context: contextAround(content, index),
      });
    }
  }

  // 5. Spacing
  for (const { value, index } of execAll(content, STYLE_SPACING, 1)) {
    if (/^\d/.test(value) || value.includes('rem') || value.includes('px') || value.includes('em')) {
      tokens.push({
        id: nextId(),
        name: null,
        category: 'spacing',
        value,
        filePath,
        lineNumber: lineNumberAt(content, index),
        context: contextAround(content, index),
      });
    }
  }

  // 6. Border radius
  for (const { value, index } of execAll(content, STYLE_RADIUS, 1)) {
    tokens.push({
      id: nextId(),
      name: null,
      category: 'border',
      value,
      filePath,
      lineNumber: lineNumberAt(content, index),
      context: contextAround(content, index),
    });
  }

  // 7. Box shadow
  for (const { value, index } of execAll(content, STYLE_SHADOW, 1)) {
    tokens.push({
      id: nextId(),
      name: null,
      category: 'shadow',
      value,
      filePath,
      lineNumber: lineNumberAt(content, index),
      context: contextAround(content, index),
    });
  }

  // 8. Animation durations
  for (const { value, index } of execAll(content, ANIM_DURATION, 1)) {
    if (/^\d/.test(value) || value.includes('ms') || value.includes('s')) {
      tokens.push({
        id: nextId(),
        name: null,
        category: 'animation',
        value,
        filePath,
        lineNumber: lineNumberAt(content, index),
        context: contextAround(content, index),
      });
    }
  }

  return tokens;
}
