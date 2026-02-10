/**
 * REQ-52 Task 1: Liquid Parser
 * Extracts design tokens from Liquid templates — settings references, inline styles,
 * section parameters, and <style> blocks.
 */

import type { ExtractedToken } from '../types';
import { parseCSSTokens } from './css-parser';

let _nextId = 0;
function nextId(): string {
  return `liq-${++_nextId}`;
}

export function resetIdCounter(): void {
  _nextId = 0;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** {{ settings.color_* }} or {{ settings.font_* }} etc. */
const SETTINGS_REF = /\{\{\s*settings\.([\w-]+)\s*\}\}/g;

/** {% assign some_color = '#hex' %} */
const ASSIGN_VALUE = /\{%[-]?\s*assign\s+([\w-]+)\s*=\s*['"]([^'"]+)['"]\s*[-]?%\}/g;

/** Inline style attributes: style="color: #fff; ..." */
const INLINE_STYLE = /style\s*=\s*["']([^"']+)["']/gi;

/** <style> ... </style> blocks */
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/gi;

/** Section schema JSON blocks: {% schema %} ... {% endschema %} */
const SCHEMA_BLOCK = /\{%[-]?\s*schema\s*[-]?%\}([\s\S]*?)\{%[-]?\s*endschema\s*[-]?%\}/gi;

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

function inferCategoryFromSettingId(id: string): 'color' | 'typography' | 'spacing' | 'border' {
  const lower = id.toLowerCase();
  if (/color|bg|background|text_color|accent|brand/.test(lower)) return 'color';
  if (/font|type|heading|body|size|weight|line_height/.test(lower)) return 'typography';
  if (/spacing|margin|padding|gap|width|height/.test(lower)) return 'spacing';
  if (/radius|border/.test(lower)) return 'border';
  return 'color'; // default
}

function isColorValue(val: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(val.trim());
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseLiquidTokens(content: string, filePath: string): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // 1. {{ settings.* }} references
  {
    const re = new RegExp(SETTINGS_REF.source, SETTINGS_REF.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const settingId = m[1];
      tokens.push({
        id: nextId(),
        name: settingId,
        category: inferCategoryFromSettingId(settingId),
        value: `{{ settings.${settingId} }}`,
        filePath,
        lineNumber: lineNumberAt(content, m.index),
        context: contextAround(content, m.index),
      });
    }
  }

  // 2. {% assign var = 'value' %} where value looks like a color
  {
    const re = new RegExp(ASSIGN_VALUE.source, ASSIGN_VALUE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const varName = m[1];
      const value = m[2];
      if (isColorValue(value)) {
        tokens.push({
          id: nextId(),
          name: varName,
          category: 'color',
          value,
          filePath,
          lineNumber: lineNumberAt(content, m.index),
          context: contextAround(content, m.index),
        });
      }
    }
  }

  // 3. Inline style="" attributes — delegate to CSS parser
  {
    const re = new RegExp(INLINE_STYLE.source, INLINE_STYLE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const styleContent = m[1];
      const baseLineNumber = lineNumberAt(content, m.index);
      const cssTokens = parseCSSTokens(`dummy { ${styleContent} }`, filePath);
      for (const t of cssTokens) {
        t.lineNumber = baseLineNumber;
        t.id = nextId();
        tokens.push(t);
      }
    }
  }

  // 4. <style> blocks — delegate to CSS parser
  {
    const re = new RegExp(STYLE_BLOCK.source, STYLE_BLOCK.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const cssContent = m[1];
      const baseLineNumber = lineNumberAt(content, m.index);
      const cssTokens = parseCSSTokens(cssContent, filePath);
      // Adjust line numbers relative to the block start
      for (const t of cssTokens) {
        t.lineNumber += baseLineNumber - 1;
        t.id = nextId();
        tokens.push(t);
      }
    }
  }

  // 5. Section schema blocks — parse JSON settings for color/font tokens
  {
    const re = new RegExp(SCHEMA_BLOCK.source, SCHEMA_BLOCK.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const jsonContent = m[1];
      const baseLineNumber = lineNumberAt(content, m.index);
      try {
        const schema = JSON.parse(jsonContent) as {
          settings?: Array<{ type?: string; id?: string; default?: unknown }>;
        };
        if (Array.isArray(schema.settings)) {
          for (const setting of schema.settings) {
            if (!setting.type || !setting.id) continue;
            if (
              (setting.type === 'color' || setting.type === 'color_background') &&
              typeof setting.default === 'string' &&
              setting.default
            ) {
              tokens.push({
                id: nextId(),
                name: setting.id,
                category: 'color',
                value: setting.default,
                filePath,
                lineNumber: baseLineNumber,
                context: `schema setting: ${setting.id} (${setting.type})`,
              });
            }
            if (
              (setting.type === 'font_picker' || setting.type === 'font') &&
              typeof setting.default === 'string' &&
              setting.default
            ) {
              tokens.push({
                id: nextId(),
                name: setting.id,
                category: 'typography',
                value: setting.default,
                filePath,
                lineNumber: baseLineNumber,
                context: `schema setting: ${setting.id} (${setting.type})`,
              });
            }
          }
        }
      } catch {
        // Invalid JSON in schema — skip
      }
    }
  }

  return tokens;
}
