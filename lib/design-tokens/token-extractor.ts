/**
 * REQ-52 Task 1: TokenExtractor
 * Orchestrates CSS, Liquid, and JS parsers to extract tokens from any file.
 */

import type { ExtractedToken } from './types';
import { parseCSSTokens } from './parsers/css-parser';
import { parseLiquidTokens } from './parsers/liquid-parser';
import { parseJSTokens } from './parsers/js-parser';

/** Determine parser from file extension. */
function getFileType(filePath: string): 'css' | 'liquid' | 'json' | 'js' | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.liquid')) return 'liquid';
  if (lower.endsWith('.json')) return 'json';
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx')
  ) return 'js';
  return null;
}

export class TokenExtractor {
  /**
   * Extract tokens from a single file.
   * @param content File content string.
   * @param filePath File path (used for parser selection and metadata).
   * @returns Array of extracted tokens.
   */
  extractFromFile(content: string, filePath: string): ExtractedToken[] {
    const fileType = getFileType(filePath);
    if (!fileType || !content) return [];

    try {
      switch (fileType) {
        case 'css':
          return parseCSSTokens(content, filePath);
        case 'liquid':
          return parseLiquidTokens(content, filePath);
        case 'js':
          return parseJSTokens(content, filePath);
        case 'json':
          // JSON files are handled by the existing extractFromJSON in extract.ts
          // For the ExtractedToken[] pipeline, we parse settings schemas
          return this.extractFromJSON(content, filePath);
        default:
          return [];
      }
    } catch (err) {
      console.warn(`TokenExtractor: Failed to parse ${filePath}:`, err);
      return [];
    }
  }

  /**
   * Extract tokens from multiple files.
   * @param files Array of { content, filePath }.
   * @returns Aggregated array of extracted tokens from all files.
   */
  extractFromFiles(files: { content: string; filePath: string }[]): ExtractedToken[] {
    const allTokens: ExtractedToken[] = [];
    for (const file of files) {
      const tokens = this.extractFromFile(file.content, file.filePath);
      allTokens.push(...tokens);
    }
    return allTokens;
  }

  /** Parse JSON settings files for tokens (Shopify settings_schema.json, etc.). */
  private extractFromJSON(content: string, filePath: string): ExtractedToken[] {
    const tokens: ExtractedToken[] = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return tokens;
    }

    const settings: Array<{ type?: string; id?: string; default?: unknown; unit?: string }> = [];
    this.collectSettings(parsed, settings);

    let idx = 0;
    for (const setting of settings) {
      if (!setting.type || !setting.id) continue;

      if (
        (setting.type === 'color' || setting.type === 'color_background') &&
        typeof setting.default === 'string' &&
        setting.default
      ) {
        tokens.push({
          id: `json-${++idx}`,
          name: setting.id,
          category: 'color',
          value: setting.default,
          filePath,
          lineNumber: 0, // JSON doesn't track lines easily without a streaming parser
          context: `setting: ${setting.id} (${setting.type})`,
        });
      }

      if (
        (setting.type === 'font_picker' || setting.type === 'font') &&
        typeof setting.default === 'string' &&
        setting.default
      ) {
        tokens.push({
          id: `json-${++idx}`,
          name: setting.id,
          category: 'typography',
          value: setting.default,
          filePath,
          lineNumber: 0,
          context: `setting: ${setting.id} (${setting.type})`,
        });
      }

      if (
        setting.type === 'range' &&
        setting.unit === 'px' &&
        typeof setting.default === 'number'
      ) {
        const idLower = (setting.id ?? '').toLowerCase();
        let category: 'border' | 'typography' | 'spacing' = 'spacing';
        if (idLower.includes('radius')) category = 'border';
        else if (idLower.includes('font') || idLower.includes('size')) category = 'typography';

        tokens.push({
          id: `json-${++idx}`,
          name: setting.id,
          category,
          value: `${setting.default}px`,
          filePath,
          lineNumber: 0,
          context: `setting: ${setting.id} (range, ${setting.unit})`,
        });
      }
    }

    return tokens;
  }

  private collectSettings(
    obj: unknown,
    out: Array<{ type?: string; id?: string; default?: unknown; unit?: string }>,
  ): void {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.collectSettings(item, out);
      }
      return;
    }
    if (obj && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (typeof record.type === 'string' && typeof record.id === 'string') {
        out.push(record as { type: string; id: string; default?: unknown; unit?: string });
      }
      for (const value of Object.values(record)) {
        this.collectSettings(value, out);
      }
    }
  }
}
