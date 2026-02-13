/**
 * Tests for suggestion-generator.ts
 * Verifies that buildReplacement (via generateSuggestions) correctly produces
 * Liquid or CSS output based on filePath and context.
 */

import { describe, it, expect } from 'vitest';
import { generateSuggestions, type StoredTokenSummary } from '../suggestion-generator';
import type { DriftItem } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKENS: StoredTokenSummary[] = [
  { name: 'color-primary', value: '#ff0000', category: 'color' },
  { name: 'spacing-md', value: '16px', category: 'spacing' },
];

function makeDriftItem(overrides: Partial<DriftItem> = {}): DriftItem {
  return {
    value: '#ff0000',
    lineNumber: 10,
    context: '.hero { color: #ff0000; }',
    category: 'color',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildReplacement (via generateSuggestions output)
// ---------------------------------------------------------------------------

describe('generateSuggestions → buildReplacement', () => {
  it('CSS context (no filePath) produces var(--token-name)', () => {
    const items: DriftItem[] = [makeDriftItem()];
    const result = generateSuggestions(items, TOKENS);

    expect(result).toHaveLength(1);
    expect(result[0].suggestedReplacement).toBe('var(--color-primary)');
  });

  it('Liquid context ({{ in context) produces {{ settings.token_name }}', () => {
    const items: DriftItem[] = [
      makeDriftItem({
        context: '{{ product.title }} style="color: #ff0000;"',
      }),
    ];
    const result = generateSuggestions(items, TOKENS);

    expect(result).toHaveLength(1);
    expect(result[0].suggestedReplacement).toBe('{{ settings.color_primary }}');
  });

  it('.liquid filePath + inline style produces Liquid output', () => {
    const items: DriftItem[] = [
      makeDriftItem({
        context: 'style="color: #ff0000"',
      }),
    ];
    // Key fix: filePath ending in .liquid should trigger Liquid replacement
    const result = generateSuggestions(items, TOKENS, 'sections/header.liquid');

    expect(result).toHaveLength(1);
    expect(result[0].suggestedReplacement).toBe('{{ settings.color_primary }}');
  });

  it('filePath undefined falls back to context-based detection', () => {
    // Pure CSS context, no filePath — should produce var()
    const cssItems: DriftItem[] = [
      makeDriftItem({ context: '.btn { color: #ff0000; }' }),
    ];
    const cssResult = generateSuggestions(cssItems, TOKENS, undefined);
    expect(cssResult[0].suggestedReplacement).toBe('var(--color-primary)');

    // Liquid context, no filePath — should still produce {{ settings }}
    const liquidItems: DriftItem[] = [
      makeDriftItem({ context: '{%- assign foo = "#ff0000" -%}' }),
    ];
    const liquidResult = generateSuggestions(liquidItems, TOKENS, undefined);
    expect(liquidResult[0].suggestedReplacement).toBe('{{ settings.color_primary }}');
  });

  it('.liquid filePath with assign context produces Liquid output', () => {
    const items: DriftItem[] = [
      makeDriftItem({ context: 'assign primary = "#ff0000"' }),
    ];
    const result = generateSuggestions(items, TOKENS, 'snippets/colors.liquid');

    expect(result).toHaveLength(1);
    expect(result[0].suggestedReplacement).toBe('{{ settings.color_primary }}');
  });

  it('returns empty array when no tokens provided', () => {
    const items: DriftItem[] = [makeDriftItem()];
    const result = generateSuggestions(items, []);
    expect(result).toEqual([]);
  });

  it('filePath is passed through and affects all suggestions', () => {
    const items: DriftItem[] = [
      makeDriftItem({ value: '#ff0000', context: 'color: #ff0000;' }),
      makeDriftItem({ value: '16px', context: 'padding: 16px;', category: 'spacing', lineNumber: 20 }),
    ];
    const result = generateSuggestions(items, TOKENS, 'templates/index.liquid');

    // Both should produce Liquid output since filePath is .liquid
    for (const s of result) {
      expect(s.suggestedReplacement).toContain('settings.');
    }
  });
});
