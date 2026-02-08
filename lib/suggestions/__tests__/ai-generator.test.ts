import { describe, it, expect } from 'vitest';
import { AISuggestionGenerator } from '../ai-generator';

describe('AISuggestionGenerator', () => {
  describe('analyzeFileContent', () => {
    const generator = new AISuggestionGenerator();

    // ── JavaScript ──────────────────────────────────────────────────────

    it('detects console.log in JavaScript', () => {
      const result = generator.analyzeFileContent(
        'const x = 1;\nconsole.log(x);\nreturn x;',
        'javascript',
      );
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s.explanation.includes('console.log')),
      ).toBe(true);
    });

    it('detects var usage in JavaScript', () => {
      const result = generator.analyzeFileContent(
        'var count = 0;\ncount++;',
        'javascript',
      );
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s.explanation.includes('var')),
      ).toBe(true);
      expect(
        result.suggestions.some((s) => s.suggestedCode.includes('const')),
      ).toBe(true);
    });

    it('detects loose equality (==) in JavaScript', () => {
      const result = generator.analyzeFileContent(
        'if (a == b) { return true; }',
        'javascript',
      );
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s.suggestedCode.includes('===')),
      ).toBe(true);
    });

    it('does not flag strict equality (===)', () => {
      const result = generator.analyzeFileContent(
        'if (a === b) { return true; }',
        'javascript',
      );
      const eqSuggestions = result.suggestions.filter((s) =>
        s.explanation.includes('=='),
      );
      expect(eqSuggestions).toHaveLength(0);
    });

    it('does not flag !== as loose equality', () => {
      const result = generator.analyzeFileContent(
        'if (a !== b) { return false; }',
        'javascript',
      );
      const eqSuggestions = result.suggestions.filter((s) =>
        s.explanation.includes('Loose equality'),
      );
      expect(eqSuggestions).toHaveLength(0);
    });

    it('handles TypeScript file types', () => {
      const result = generator.analyzeFileContent(
        'var x: number = 1;\nconsole.log(x);',
        'typescript',
      );
      expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    });

    // ── CSS ─────────────────────────────────────────────────────────────

    it('detects !important in CSS', () => {
      const result = generator.analyzeFileContent(
        '.header { color: red !important; }',
        'css',
      );
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s.explanation.includes('!important')),
      ).toBe(true);
    });

    it('returns clean result for CSS without !important', () => {
      const result = generator.analyzeFileContent(
        '.header { color: red; }',
        'css',
      );
      expect(result.suggestions).toHaveLength(0);
    });

    // ── Liquid ──────────────────────────────────────────────────────────

    it('detects deeply nested conditionals in Liquid', () => {
      const content = [
        '{% if a %}',
        '  {% if b %}',
        '    {% if c %}',
        '      {% if d %}',
        '        deeply nested',
        '      {% endif %}',
        '    {% endif %}',
        '  {% endif %}',
        '{% endif %}',
      ].join('\n');

      const result = generator.analyzeFileContent(content, 'liquid');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) =>
          s.explanation.toLowerCase().includes('nested'),
        ),
      ).toBe(true);
    });

    it('does not flag 3-level nesting in Liquid', () => {
      const content = [
        '{% if a %}',
        '  {% if b %}',
        '    {% if c %}',
        '      ok',
        '    {% endif %}',
        '  {% endif %}',
        '{% endif %}',
      ].join('\n');

      const result = generator.analyzeFileContent(content, 'liquid');
      const nestingSuggestions = result.suggestions.filter((s) =>
        s.explanation.toLowerCase().includes('nested'),
      );
      expect(nestingSuggestions).toHaveLength(0);
    });

    // ── Edge cases ──────────────────────────────────────────────────────

    it('returns empty suggestions for unknown file types', () => {
      const result = generator.analyzeFileContent(
        'some content',
        'unknown-type',
      );
      expect(result.suggestions).toHaveLength(0);
    });

    it('returns empty suggestions for empty content', () => {
      const result = generator.analyzeFileContent('', 'javascript');
      expect(result.suggestions).toHaveLength(0);
    });
  });
});
