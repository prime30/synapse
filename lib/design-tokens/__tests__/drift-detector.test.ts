/**
 * REQ-52 Task 6: Unit tests for drift detection and tokenisation suggestions.
 *
 * Mocks the token-model's `listByProject` so we can test the DriftDetector
 * and suggestion generator in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListByProject = vi.fn();

vi.mock('../models/token-model', () => ({
  listByProject: (...args: unknown[]) => mockListByProject(...args),
}));

// Import modules under test AFTER mocks are registered
const { DriftDetector } = await import('../drift/drift-detector');
const { generateSuggestions, parseColor } = await import(
  '../drift/suggestion-generator'
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-drift-test';

/** Helper to build a stored-token row (only the fields the detector uses). */
function storedToken(name: string, value: string, category: string) {
  return {
    id: `tok-${name}`,
    project_id: PROJECT_ID,
    name,
    category,
    value,
    aliases: [],
    description: null,
    metadata: {},
    semantic_parent_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DriftDetector', () => {
  let detector: InstanceType<typeof DriftDetector>;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new DriftDetector();
  });

  // ---- Test 1: detects hardcoded color not in token list -----------------

  it('detects hardcoded color not in token list', async () => {
    mockListByProject.mockResolvedValue([
      storedToken('color-primary', '#3B82F6', 'color'),
    ]);

    const css = `.hero {\n  background: #FF5733;\n}`;
    const result = await detector.detectDrift(PROJECT_ID, css, 'theme.css');

    expect(result.filePath).toBe('theme.css');
    // #FF5733 is not in the token list and not close to #3B82F6
    expect(result.hardcodedValues.length).toBeGreaterThanOrEqual(1);
    const item = result.hardcodedValues.find((d) => d.value === '#FF5733');
    expect(item).toBeDefined();
    expect(item!.category).toBe('color');
  });

  // ---- Test 2: detects near-match (similar but not exact color) ----------

  it('detects near-match (similar but not exact color)', async () => {
    // #3B82F5 is 1 unit away from #3B82F6 in RGB blue channel
    mockListByProject.mockResolvedValue([
      storedToken('color-primary', '#3B82F6', 'color'),
    ]);

    const css = `.card {\n  border-color: #3B82F5;\n}`;
    const result = await detector.detectDrift(PROJECT_ID, css, 'card.css');

    expect(result.nearMatches.length).toBeGreaterThanOrEqual(1);
    const near = result.nearMatches.find((d) => d.value === '#3B82F5');
    expect(near).toBeDefined();
    expect(near!.category).toBe('color');
  });

  // ---- Test 3: suggests correct token for exact match --------------------

  it('suggests correct token for exact value match', async () => {
    mockListByProject.mockResolvedValue([
      storedToken('color-primary', '#3B82F6', 'color'),
      storedToken('spacing-md', '16px', 'spacing'),
    ]);

    // Uses the exact stored colour value as a hardcoded literal
    const css = `.btn {\n  color: #3B82F6;\n  padding: 16px;\n}`;
    const result = await detector.detectDrift(PROJECT_ID, css, 'btn.css');

    // There should be suggestions with confidence 1.0 for exact matches
    const colorSuggestion = result.suggestions.find(
      (s) => s.suggestedToken === 'color-primary',
    );
    expect(colorSuggestion).toBeDefined();
    expect(colorSuggestion!.confidence).toBe(1);

    const spacingSuggestion = result.suggestions.find(
      (s) => s.suggestedToken === 'spacing-md',
    );
    expect(spacingSuggestion).toBeDefined();
    expect(spacingSuggestion!.confidence).toBe(1);
  });

  // ---- Test 4: generates proper CSS var() replacement --------------------

  it('generates proper CSS var() replacement', async () => {
    mockListByProject.mockResolvedValue([
      storedToken('color-primary', '#3B82F6', 'color'),
    ]);

    const css = `.link {\n  color: #3B82F6;\n}`;
    const result = await detector.detectDrift(PROJECT_ID, css, 'link.css');

    const suggestion = result.suggestions.find(
      (s) => s.suggestedToken === 'color-primary',
    );
    expect(suggestion).toBeDefined();
    expect(suggestion!.suggestedReplacement).toBe('var(--color-primary)');
  });

  // ---- Test 5: handles empty token list gracefully -----------------------

  it('handles empty token list gracefully', async () => {
    mockListByProject.mockResolvedValue([]);

    const css = `.hero {\n  color: #FF0000;\n  padding: 8px;\n}`;
    const result = await detector.detectDrift(PROJECT_ID, css, 'hero.css');

    expect(result.filePath).toBe('hero.css');
    // Everything is hardcoded, but no suggestions since no tokens to match against
    expect(result.hardcodedValues.length).toBeGreaterThanOrEqual(1);
    expect(result.suggestions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suggestion generator (unit tests)
// ---------------------------------------------------------------------------

describe('generateSuggestions', () => {
  it('returns empty array when no existing tokens', () => {
    const items = [
      { value: '#FF0000', lineNumber: 1, context: 'color: #FF0000;', category: 'color' as const },
    ];
    const result = generateSuggestions(items, []);
    expect(result).toHaveLength(0);
  });

  it('produces Liquid replacement for Liquid context', () => {
    const items = [
      {
        value: '#3B82F6',
        lineNumber: 5,
        context: '{{ section.settings.color }}',
        category: 'color' as const,
      },
    ];
    const tokens = [{ name: 'color-primary', value: '#3B82F6', category: 'color' }];
    const result = generateSuggestions(items, tokens);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].suggestedReplacement).toBe('{{ settings.color_primary }}');
  });

  it('sorts suggestions by confidence descending', () => {
    const items = [
      { value: '#3B82F6', lineNumber: 1, context: 'color: #3B82F6;', category: 'color' as const },
      { value: '#3B82F0', lineNumber: 2, context: 'color: #3B82F0;', category: 'color' as const },
    ];
    const tokens = [{ name: 'color-primary', value: '#3B82F6', category: 'color' }];
    const result = generateSuggestions(items, tokens);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });
});

// ---------------------------------------------------------------------------
// parseColor utility
// ---------------------------------------------------------------------------

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#3B82F6')).toEqual([59, 130, 246]);
  });

  it('parses 3-digit hex shorthand', () => {
    expect(parseColor('#0af')).toEqual([0, 170, 255]);
  });

  it('parses rgb()', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual([255, 0, 128]);
  });

  it('parses rgba()', () => {
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  it('returns null for non-color strings', () => {
    expect(parseColor('16px')).toBeNull();
    expect(parseColor('Arial')).toBeNull();
  });
});
