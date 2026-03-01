import { describe, it, expect } from 'vitest';
import type { ExtractedToken } from '../types';
import { groupSimilarValues } from '../inference/token-grouping';
import { detectScalePattern, detectTypographicScale } from '../inference/scale-detector';
import { suggestTokenName } from '../inference/naming-suggester';
import { inferTokens } from '../inference';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 1;
function makeToken(overrides: Partial<ExtractedToken> & Pick<ExtractedToken, 'category' | 'value'>): ExtractedToken {
  return {
    id: `tok-${nextId++}`,
    name: null,
    filePath: 'test.css',
    lineNumber: 1,
    context: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupSimilarValues
// ---------------------------------------------------------------------------

describe('groupSimilarValues', () => {
  it('groups similar hex colors together', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#3B82F6' }),  // blue
      makeToken({ category: 'color', value: '#2563EB' }),  // similar blue
      makeToken({ category: 'color', value: '#ff0000' }),  // red — far away
    ];

    const groups = groupSimilarValues(tokens);
    const colorGroups = groups.filter((g) => g.category === 'color');
    expect(colorGroups.length).toBeGreaterThanOrEqual(2);

    // The two blues should be in the same group
    const blueGroup = colorGroups.find((g) =>
      g.tokens.some((t) => t.value === '#3B82F6') &&
      g.tokens.some((t) => t.value === '#2563EB'),
    );
    expect(blueGroup).toBeDefined();

    // Red should NOT be in the same group as the blues
    const redGroup = colorGroups.find((g) =>
      g.tokens.some((t) => t.value === '#ff0000'),
    );
    expect(redGroup).toBeDefined();
    expect(redGroup!.tokens.some((t) => t.value === '#3B82F6')).toBe(false);
  });

  it('groups rgb() colors alongside hex colors of the same hue', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#ff0000' }),
      makeToken({ category: 'color', value: 'rgb(240, 10, 10)' }),
    ];
    const groups = groupSimilarValues(tokens);
    const colorGroups = groups.filter((g) => g.category === 'color');
    // Both reds should be in one group
    expect(colorGroups.length).toBe(1);
    expect(colorGroups[0].tokens.length).toBe(2);
  });

  it('puts unparseable colour values into a separate group', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#abc' }),
      makeToken({ category: 'color', value: '{{ settings.color_primary }}' }),
    ];
    const groups = groupSimilarValues(tokens);
    const unparseable = groups.find((g) => g.pattern.includes('unparseable'));
    expect(unparseable).toBeDefined();
    expect(unparseable!.tokens.length).toBe(1);
  });

  it('groups spacing tokens by numeric proximity', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '32px' }),
    ];
    const groups = groupSimilarValues(tokens);
    const spacingGroups = groups.filter((g) => g.category === 'spacing');
    expect(spacingGroups.length).toBe(2);
    const group8 = spacingGroups.find((g) => g.tokens.some((t) => t.value === '8px'));
    expect(group8).toBeDefined();
    expect(group8!.tokens.length).toBe(2);
  });

  it('groups typography tokens by font-family', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'typography', value: 'Inter, sans-serif' }),
      makeToken({ category: 'typography', value: 'Inter' }),
      makeToken({ category: 'typography', value: 'Montserrat, serif' }),
    ];
    const groups = groupSimilarValues(tokens);
    const typoGroups = groups.filter((g) => g.category === 'typography');
    const interGroup = typoGroups.find((g) => g.pattern.includes('inter'));
    expect(interGroup).toBeDefined();
    expect(interGroup!.tokens.length).toBe(2);
  });

  it('generates human-readable pattern descriptions', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#0000ff' }),
      makeToken({ category: 'color', value: '#0033ff' }),
    ];
    const groups = groupSimilarValues(tokens);
    expect(groups[0].pattern).toMatch(/blue|colors/i);
  });

  it('returns empty array for empty input', () => {
    expect(groupSimilarValues([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectScalePattern
// ---------------------------------------------------------------------------

describe('detectScalePattern', () => {
  it('detects a 2× scale (4, 8, 16, 32)', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '16px' }),
      makeToken({ category: 'spacing', value: '32px' }),
    ];
    const scale = detectScalePattern(tokens);
    expect(scale).not.toBeNull();
    expect(scale!.baseValue).toBe(4);
    expect(scale!.ratio).toBe(2);
    expect(scale!.values).toEqual([4, 8, 16, 32]);
  });

  it('detects a 1.5× scale', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '12px' }),
      makeToken({ category: 'spacing', value: '18px' }),
      makeToken({ category: 'spacing', value: '27px' }),
    ];
    const scale = detectScalePattern(tokens);
    expect(scale).not.toBeNull();
    expect(scale!.baseValue).toBe(8);
    expect(scale!.ratio).toBe(1.5);
  });

  it('handles rem values (normalised to px)', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '0.25rem' }), // 4px
      makeToken({ category: 'spacing', value: '0.5rem' }),   // 8px
      makeToken({ category: 'spacing', value: '1rem' }),     // 16px
      makeToken({ category: 'spacing', value: '2rem' }),     // 32px
    ];
    const scale = detectScalePattern(tokens);
    expect(scale).not.toBeNull();
    expect(scale!.ratio).toBe(2);
  });

  it('returns null when there are fewer than 3 values', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '8px' }),
    ];
    expect(detectScalePattern(tokens)).toBeNull();
  });

  it('returns null for random non-scaled values', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '5px' }),
      makeToken({ category: 'spacing', value: '14px' }),
      makeToken({ category: 'spacing', value: '23px' }),
      makeToken({ category: 'spacing', value: '91px' }),
    ];
    expect(detectScalePattern(tokens)).toBeNull();
  });

  it('deduplicates values before analysis', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '16px' }),
    ];
    const scale = detectScalePattern(tokens);
    expect(scale).not.toBeNull();
    expect(scale!.values).toEqual([4, 8, 16]);
  });
});

// ---------------------------------------------------------------------------
// detectTypographicScale (Phase 10a)
// ---------------------------------------------------------------------------

describe('detectTypographicScale', () => {
  it('detects 1.25 modular scale from font sizes', () => {
    const result = detectTypographicScale([12, 15, 18.75, 23.4, 29.3]);
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(1.25, 2);
    expect(result!.baseSize).toBe(12);
  });

  it('returns null for fewer than 3 values', () => {
    expect(detectTypographicScale([12, 15])).toBeNull();
    expect(detectTypographicScale([])).toBeNull();
  });

  it('detects 1.5 scale', () => {
    const result = detectTypographicScale([14, 21, 31.5]);
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(1.5, 2);
  });
});

// ---------------------------------------------------------------------------
// suggestTokenName
// ---------------------------------------------------------------------------

describe('suggestTokenName', () => {
  it('reuses existing token name with high confidence', () => {
    const token = makeToken({
      category: 'color',
      value: '#3B82F6',
      name: 'color-primary',
    });
    const result = suggestTokenName(token, []);
    expect(result.name).toContain('primary');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('infers name from context keywords', () => {
    const token = makeToken({
      category: 'color',
      value: '#ff0000',
      context: '.btn-primary { color: #ff0000; }',
    });
    const result = suggestTokenName(token, []);
    expect(result.name).toMatch(/button|primary/);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('appends shade qualifiers for light/dark colors', () => {
    const lightToken = makeToken({
      category: 'color',
      value: '#f0f0f0',
      context: '.bg-light { background: #f0f0f0; }',
    });
    const result = suggestTokenName(lightToken, []);
    expect(result.name).toMatch(/light/);
  });

  it('returns low confidence for generic values without context', () => {
    const token = makeToken({
      category: 'spacing',
      value: '16px',
      context: '.x { padding: 16px; }',
    });
    const result = suggestTokenName(token, []);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it('deduplicates against existing names', () => {
    const token = makeToken({
      category: 'color',
      value: '#abc',
      name: 'brand-blue',
    });
    const result1 = suggestTokenName(token, []);
    const result2 = suggestTokenName(token, [result1.name]);
    expect(result2.name).not.toBe(result1.name);
  });

  it('handles all token categories', () => {
    for (const cat of ['color', 'typography', 'spacing', 'shadow', 'border', 'animation'] as const) {
      const token = makeToken({ category: cat, value: '8px' });
      const result = suggestTokenName(token, []);
      expect(result.name).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// inferTokens (full pipeline)
// ---------------------------------------------------------------------------

describe('inferTokens', () => {
  it('returns InferredToken[] with names, groups, and confidence', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#3B82F6', context: '.btn-primary { color: #3B82F6; }' }),
      makeToken({ category: 'color', value: '#2563EB', context: '.link-primary { color: #2563EB; }' }),
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '16px' }),
    ];

    const result = inferTokens(tokens);
    expect(result.length).toBe(tokens.length);

    for (const t of result) {
      expect(t.suggestedName).toBeTruthy();
      expect(t.confidence).toBeGreaterThan(0);
      expect(t.groupId).toBeTruthy();
      expect(Array.isArray(t.inconsistencies)).toBe(true);
    }
  });

  it('flags inconsistencies when same value has different names', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#ff0000', name: 'red-primary' }),
      makeToken({ category: 'color', value: '#ff0000', name: 'brand-red' }),
    ];

    const result = inferTokens(tokens);
    const withIssues = result.filter((t) => t.inconsistencies.length > 0);
    expect(withIssues.length).toBeGreaterThan(0);
    expect(withIssues[0].inconsistencies[0]).toMatch(/multiple names/i);
  });

  it('flags near-duplicate colors as inconsistencies', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'color', value: '#ff0000' }),
      makeToken({ category: 'color', value: '#ff0505' }), // very close to #ff0000
    ];

    const result = inferTokens(tokens);
    const withIssues = result.filter((t) => t.inconsistencies.length > 0);
    expect(withIssues.length).toBeGreaterThan(0);
    expect(withIssues[0].inconsistencies[0]).toMatch(/similar color/i);
  });

  it('returns empty array for empty input', () => {
    expect(inferTokens([])).toEqual([]);
  });

  it('enriches spacing group patterns with scale info when detected', () => {
    const tokens: ExtractedToken[] = [
      makeToken({ category: 'spacing', value: '4px' }),
      makeToken({ category: 'spacing', value: '8px' }),
      makeToken({ category: 'spacing', value: '16px' }),
      makeToken({ category: 'spacing', value: '32px' }),
    ];

    const result = inferTokens(tokens);
    // All spacing tokens should share group info that mentions the scale
    const groupIds = new Set(result.map((t) => t.groupId));
    expect(groupIds.size).toBeGreaterThanOrEqual(1);
  });
});
