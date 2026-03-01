import { describe, it, expect, beforeEach } from 'vitest';
import { parseCSSTokens, resetIdCounter as resetCSS } from '../parsers/css-parser';
import { parseLiquidTokens, resetIdCounter as resetLiquid } from '../parsers/liquid-parser';
import { parseJSTokens, resetIdCounter as resetJS } from '../parsers/js-parser';
import { TokenExtractor } from '../token-extractor';

// ---------------------------------------------------------------------------
// CSS Parser
// ---------------------------------------------------------------------------

describe('parseCSSTokens', () => {
  beforeEach(() => resetCSS());

  it('extracts CSS custom properties from :root', () => {
    const css = `:root {\n  --color-primary: #3B82F6;\n  --spacing-sm: 8px;\n}`;
    const tokens = parseCSSTokens(css, 'assets/theme.css');
    const primary = tokens.find((t) => t.name === 'color-primary');
    expect(primary).toBeDefined();
    expect(primary!.value).toBe('#3B82F6');
    expect(primary!.category).toBe('color');
    expect(primary!.filePath).toBe('assets/theme.css');
    expect(primary!.lineNumber).toBe(2);

    const spacing = tokens.find((t) => t.name === 'spacing-sm');
    expect(spacing).toBeDefined();
    expect(spacing!.value).toBe('8px');
    expect(spacing!.category).toBe('spacing');
  });

  it('extracts inline hex colors with line numbers', () => {
    const css = `.btn {\n  color: #ff0000;\n  background: #0af;\n}`;
    const tokens = parseCSSTokens(css, 'test.css');
    const colors = tokens.filter((t) => t.category === 'color');
    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(colors.some((t) => t.value === '#ff0000')).toBe(true);
    expect(colors.some((t) => t.value === '#0af')).toBe(true);
  });

  it('extracts rgb/rgba/hsl colors', () => {
    const css = `.a { color: rgb(255, 0, 0); }\n.b { background: rgba(0, 0, 0, 0.5); }`;
    const tokens = parseCSSTokens(css, 'test.css');
    expect(tokens.some((t) => t.value === 'rgb(255, 0, 0)')).toBe(true);
    expect(tokens.some((t) => t.value === 'rgba(0, 0, 0, 0.5)')).toBe(true);
  });

  it('extracts font-family, font-size, text-transform, and spacing declarations', () => {
    const css = `body { font-family: Inter, sans-serif; font-size: 16px; text-transform: uppercase; margin: 10px 20px; }`;
    const tokens = parseCSSTokens(css, 'test.css');
    expect(tokens.some((t) => t.category === 'typography' && t.value.includes('Inter'))).toBe(true);
    expect(tokens.some((t) => t.category === 'typography' && t.value === '16px')).toBe(true);
    expect(tokens.some((t) => t.category === 'typography' && t.value === 'uppercase')).toBe(true);
    expect(tokens.some((t) => t.category === 'spacing' && t.value === '10px')).toBe(true);
    expect(tokens.some((t) => t.category === 'spacing' && t.value === '20px')).toBe(true);
  });

  it('extracts box-shadow and border-radius', () => {
    const css = `.card { box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; }`;
    const tokens = parseCSSTokens(css, 'test.css');
    expect(tokens.some((t) => t.category === 'shadow')).toBe(true);
    expect(tokens.some((t) => t.category === 'border' && t.value === '8px')).toBe(true);
  });

  it('extracts animation and transition', () => {
    const css = `.fade { transition: opacity 0.3s ease; animation: slideIn 0.5s; }`;
    const tokens = parseCSSTokens(css, 'test.css');
    expect(tokens.some((t) => t.category === 'animation')).toBe(true);
  });

  it('handles empty CSS gracefully', () => {
    const tokens = parseCSSTokens('', 'test.css');
    expect(tokens).toEqual([]);
  });

  it('preserves filePath on every token', () => {
    const css = `.a { color: #abc; }`;
    const tokens = parseCSSTokens(css, 'assets/custom.css');
    for (const t of tokens) {
      expect(t.filePath).toBe('assets/custom.css');
    }
  });
});

// ---------------------------------------------------------------------------
// Liquid Parser
// ---------------------------------------------------------------------------

describe('parseLiquidTokens', () => {
  beforeEach(() => {
    resetLiquid();
    resetCSS(); // liquid parser delegates to CSS parser
  });

  it('extracts {{ settings.* }} references', () => {
    const liquid = `<div style="color: {{ settings.color_primary }};">Hello</div>`;
    const tokens = parseLiquidTokens(liquid, 'sections/header.liquid');
    const settingToken = tokens.find((t) => t.name === 'color_primary');
    expect(settingToken).toBeDefined();
    expect(settingToken!.value).toBe('{{ settings.color_primary }}');
    expect(settingToken!.category).toBe('color');
    expect(settingToken!.filePath).toBe('sections/header.liquid');
  });

  it('extracts {% assign %} color values', () => {
    const liquid = `{% assign hero_bg = '#1a1a2e' %}`;
    const tokens = parseLiquidTokens(liquid, 'snippets/hero.liquid');
    const assignToken = tokens.find((t) => t.name === 'hero_bg');
    expect(assignToken).toBeDefined();
    expect(assignToken!.value).toBe('#1a1a2e');
    expect(assignToken!.category).toBe('color');
  });

  it('extracts tokens from inline style="" attributes', () => {
    const liquid = `<section style="background: #f0f0f0; padding: 20px;">Content</section>`;
    const tokens = parseLiquidTokens(liquid, 'test.liquid');
    expect(tokens.some((t) => t.category === 'color')).toBe(true);
    expect(tokens.some((t) => t.category === 'spacing')).toBe(true);
  });

  it('extracts tokens from <style> blocks', () => {
    const liquid = `<style>\n.hero { color: #333; font-size: 24px; }\n</style>`;
    const tokens = parseLiquidTokens(liquid, 'test.liquid');
    expect(tokens.some((t) => t.value === '#333')).toBe(true);
    expect(tokens.some((t) => t.value === '24px')).toBe(true);
  });

  it('extracts color tokens from {% schema %} blocks', () => {
    const liquid = `
      {% schema %}
      {
        "settings": [
          { "type": "color", "id": "bg_color", "default": "#ffffff" },
          { "type": "font_picker", "id": "heading_font", "default": "Montserrat" }
        ]
      }
      {% endschema %}
    `;
    const tokens = parseLiquidTokens(liquid, 'sections/hero.liquid');
    expect(tokens.some((t) => t.name === 'bg_color' && t.value === '#ffffff')).toBe(true);
    expect(tokens.some((t) => t.name === 'heading_font' && t.value === 'Montserrat')).toBe(true);
  });

  it('handles empty Liquid files', () => {
    const tokens = parseLiquidTokens('', 'test.liquid');
    expect(tokens).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// JS Parser
// ---------------------------------------------------------------------------

describe('parseJSTokens', () => {
  beforeEach(() => resetJS());

  it('extracts colors from style objects', () => {
    const js = `const styles = { color: '#3B82F6', backgroundColor: '#000' };`;
    const tokens = parseJSTokens(js, 'assets/app.js');
    expect(tokens.some((t) => t.value === '#3B82F6' && t.category === 'color')).toBe(true);
    expect(tokens.some((t) => t.value === '#000' && t.category === 'color')).toBe(true);
  });

  it('extracts fontFamily from style objects', () => {
    const js = `const styles = { fontFamily: 'Inter, sans-serif' };`;
    const tokens = parseJSTokens(js, 'test.js');
    expect(tokens.some((t) => t.category === 'typography' && t.value.includes('Inter'))).toBe(true);
  });

  it('extracts fontSize and spacing', () => {
    const js = `const styles = { fontSize: '16px', padding: '10px', margin: '20px' };`;
    const tokens = parseJSTokens(js, 'test.js');
    expect(tokens.some((t) => t.category === 'typography' && t.value === '16px')).toBe(true);
    expect(tokens.some((t) => t.category === 'spacing' && t.value === '10px')).toBe(true);
    expect(tokens.some((t) => t.category === 'spacing' && t.value === '20px')).toBe(true);
  });

  it('extracts borderRadius and boxShadow', () => {
    const js = `const card = { borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };`;
    const tokens = parseJSTokens(js, 'test.js');
    expect(tokens.some((t) => t.category === 'border' && t.value === '8px')).toBe(true);
    expect(tokens.some((t) => t.category === 'shadow')).toBe(true);
  });

  it('extracts animation durations', () => {
    const js = `const config = { duration: '300ms', transitionDuration: '0.5s' };`;
    const tokens = parseJSTokens(js, 'test.js');
    expect(tokens.some((t) => t.category === 'animation' && t.value === '300ms')).toBe(true);
    expect(tokens.some((t) => t.category === 'animation' && t.value === '0.5s')).toBe(true);
  });

  it('handles empty JS', () => {
    expect(parseJSTokens('', 'test.js')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TokenExtractor (orchestrator)
// ---------------------------------------------------------------------------

describe('TokenExtractor', () => {
  it('routes CSS files to CSS parser', () => {
    const extractor = new TokenExtractor();
    const tokens = extractor.extractFromFile('.btn { color: #abc; }', 'assets/style.css');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].filePath).toBe('assets/style.css');
  });

  it('routes Liquid files to Liquid parser', () => {
    const extractor = new TokenExtractor();
    const tokens = extractor.extractFromFile('{{ settings.color_primary }}', 'sections/header.liquid');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('routes JS files to JS parser', () => {
    const extractor = new TokenExtractor();
    const tokens = extractor.extractFromFile("const x = { color: '#fff' };", 'assets/app.js');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('routes JSON files to JSON extractor', () => {
    const extractor = new TokenExtractor();
    const json = JSON.stringify([
      { name: 'C', settings: [{ type: 'color', id: 'c', default: '#abc' }] },
    ]);
    const tokens = extractor.extractFromFile(json, 'config/settings_schema.json');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].category).toBe('color');
  });

  it('returns empty array for unknown file types', () => {
    const extractor = new TokenExtractor();
    expect(extractor.extractFromFile('hello', 'README.md')).toEqual([]);
  });

  it('extractFromFiles aggregates tokens from multiple files', () => {
    const extractor = new TokenExtractor();
    const tokens = extractor.extractFromFiles([
      { content: '.a { color: #abc; }', filePath: 'a.css' },
      { content: '{{ settings.color_primary }}', filePath: 'b.liquid' },
      { content: "const x = { color: '#def' };", filePath: 'c.js' },
    ]);
    expect(tokens.length).toBeGreaterThan(2);
    expect(new Set(tokens.map((t) => t.filePath)).size).toBe(3);
  });

  it('handles parse errors gracefully', () => {
    const extractor = new TokenExtractor();
    // Malformed content shouldn't throw
    const tokens = extractor.extractFromFile('{{{{broken', 'test.liquid');
    expect(Array.isArray(tokens)).toBe(true);
  });
});
