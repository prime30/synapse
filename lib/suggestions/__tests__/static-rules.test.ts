import { describe, it, expect } from 'vitest';
import { StaticRuleEngine } from '../static-rules';

describe('StaticRuleEngine', () => {
  const engine = new StaticRuleEngine();

  // ── JavaScript rules ────────────────────────────────────────────────────

  describe('JavaScript rules', () => {
    it('detects console.log', () => {
      const violations = engine.analyzeFile(
        'console.log("debug");',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/no-console-log')).toBe(
        true,
      );
    });

    it('detects var usage', () => {
      const violations = engine.analyzeFile(
        'var x = 1;',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/no-var')).toBe(true);
      const varV = violations.find((v) => v.rule === 'js/no-var')!;
      expect(varV.suggestedCode).toContain('const');
    });

    it('detects == usage', () => {
      const violations = engine.analyzeFile(
        'if (x == y) {}',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/eqeqeq')).toBe(true);
      const eqV = violations.find((v) => v.rule === 'js/eqeqeq')!;
      expect(eqV.suggestedCode).toContain('===');
    });

    it('does not flag === as loose equality', () => {
      const violations = engine.analyzeFile(
        'if (x === y) {}',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/eqeqeq')).toBe(false);
    });

    it('does not flag !== as loose equality', () => {
      const violations = engine.analyzeFile(
        'if (x !== y) {}',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/eqeqeq')).toBe(false);
    });

    it('skips commented lines', () => {
      const violations = engine.analyzeFile(
        '// console.log("debug");',
        'javascript',
        'app.js',
      );
      expect(violations.some((v) => v.rule === 'js/no-console-log')).toBe(
        false,
      );
    });

    it('resolves type from file extension when fileType is generic', () => {
      const violations = engine.analyzeFile(
        'var x = 1;',
        'text',
        'utils.ts',
      );
      expect(violations.some((v) => v.rule === 'js/no-var')).toBe(true);
    });

    it('handles multiple issues on separate lines', () => {
      const code = [
        'var a = 1;',
        'console.log(a);',
        'if (a == 2) {}',
      ].join('\n');
      const violations = engine.analyzeFile(code, 'javascript', 'app.js');
      expect(violations.some((v) => v.rule === 'js/no-var')).toBe(true);
      expect(violations.some((v) => v.rule === 'js/no-console-log')).toBe(
        true,
      );
      expect(violations.some((v) => v.rule === 'js/eqeqeq')).toBe(true);
    });
  });

  // ── CSS rules ─────────────────────────────────────────────────────────

  describe('CSS rules', () => {
    it('detects !important', () => {
      const violations = engine.analyzeFile(
        '.foo { color: red !important; }',
        'css',
        'style.css',
      );
      expect(violations.some((v) => v.rule === 'css/no-important')).toBe(true);
      const impV = violations.find((v) => v.rule === 'css/no-important')!;
      expect(impV.suggestedCode).not.toContain('!important');
    });

    it('detects duplicate properties in same block', () => {
      const css = `.foo {
  color: red;
  color: blue;
}`;
      const violations = engine.analyzeFile(css, 'css', 'style.css');
      expect(
        violations.some((v) => v.rule === 'css/no-duplicate-properties'),
      ).toBe(true);
    });

    it('detects duplicate properties on a single line', () => {
      const violations = engine.analyzeFile(
        '.foo { color: red; color: blue; }',
        'css',
        'style.css',
      );
      expect(
        violations.some((v) => v.rule === 'css/no-duplicate-properties'),
      ).toBe(true);
    });

    it('does not flag different properties as duplicates', () => {
      const violations = engine.analyzeFile(
        '.foo { color: red; background: blue; }',
        'css',
        'style.css',
      );
      expect(
        violations.some((v) => v.rule === 'css/no-duplicate-properties'),
      ).toBe(false);
    });

    it('detects universal selector *', () => {
      const violations = engine.analyzeFile(
        '* { margin: 0; }',
        'css',
        'style.css',
      );
      expect(
        violations.some((v) => v.rule === 'css/no-universal-selector'),
      ).toBe(true);
    });

    it('does not flag * inside property values', () => {
      const violations = engine.analyzeFile(
        '.grid { grid-template-columns: repeat(3, 1fr); }',
        'css',
        'style.css',
      );
      expect(
        violations.some((v) => v.rule === 'css/no-universal-selector'),
      ).toBe(false);
    });
  });

  // ── Liquid rules ──────────────────────────────────────────────────────

  describe('Liquid rules', () => {
    it('detects deprecated color_to_rgb filter', () => {
      const violations = engine.analyzeFile(
        '{{ settings.color | color_to_rgb }}',
        'liquid',
        'theme.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/deprecated-filter')).toBe(
        true,
      );
    });

    it('detects deprecated hex_to_rgba filter', () => {
      const violations = engine.analyzeFile(
        '{{ "#ff0000" | hex_to_rgba }}',
        'liquid',
        'theme.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/deprecated-filter')).toBe(
        true,
      );
    });

    it('detects deeply nested if blocks (>3 levels)', () => {
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
      const violations = engine.analyzeFile(
        content,
        'liquid',
        'section.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/deep-nesting')).toBe(
        true,
      );
    });

    it('does not flag 3-level nesting', () => {
      const content = [
        '{% if a %}',
        '  {% if b %}',
        '    {% if c %}',
        '      ok',
        '    {% endif %}',
        '  {% endif %}',
        '{% endif %}',
      ].join('\n');
      const violations = engine.analyzeFile(
        content,
        'liquid',
        'section.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/deep-nesting')).toBe(
        false,
      );
    });

    it('detects missing alt on img tags', () => {
      const violations = engine.analyzeFile(
        '<img src="banner.png">',
        'liquid',
        'section.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/missing-alt')).toBe(
        true,
      );
    });

    it('does not flag img tags that have alt', () => {
      const violations = engine.analyzeFile(
        '<img src="banner.png" alt="Banner">',
        'liquid',
        'section.liquid',
      );
      expect(violations.some((v) => v.rule === 'liquid/missing-alt')).toBe(
        false,
      );
    });
  });

  // ── Routing ───────────────────────────────────────────────────────────

  describe('file type routing', () => {
    it('returns empty array for unknown file types', () => {
      const violations = engine.analyzeFile(
        'some content',
        'unknown',
        'file.xyz',
      );
      expect(violations).toHaveLength(0);
    });

    it('routes .ts files to JavaScript rules', () => {
      const violations = engine.analyzeFile(
        'var x = 1;',
        'typescript',
        'app.ts',
      );
      expect(violations.some((v) => v.rule === 'js/no-var')).toBe(true);
    });

    it('routes .scss files to CSS rules', () => {
      const violations = engine.analyzeFile(
        '.foo { color: red !important; }',
        'scss',
        'style.scss',
      );
      expect(violations.some((v) => v.rule === 'css/no-important')).toBe(true);
    });
  });
});
