import { describe, it, expect } from 'vitest';
import {
  extractFromCSS,
  extractFromJSON,
  extractTokens,
  mergeTokens,
} from '../extract';
import { emptyTokens } from '../types';

// ---------------------------------------------------------------------------
// CSS extraction
// ---------------------------------------------------------------------------

describe('extractFromCSS', () => {
  it('extracts hex colors', () => {
    const css = `
      .btn { color: #ff0000; background: #0af; }
      .card { border-color: #333333; }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.colors).toContain('#ff0000');
    expect(tokens.colors).toContain('#0af');
    expect(tokens.colors).toContain('#333333');
  });

  it('extracts rgb/rgba/hsl colors', () => {
    const css = `
      .a { color: rgb(255, 0, 0); }
      .b { background: rgba(0, 0, 0, 0.5); }
      .c { color: hsl(120, 50%, 50%); }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.colors).toContain('rgb(255, 0, 0)');
    expect(tokens.colors).toContain('rgba(0, 0, 0, 0.5)');
    expect(tokens.colors).toContain('hsl(120, 50%, 50%)');
  });

  it('extracts CSS custom property color references', () => {
    const css = `
      .x { color: var(--color-primary); background: var(--bg-surface); }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.colors).toContain('var(--color-primary)');
    expect(tokens.colors).toContain('var(--bg-surface)');
  });

  it('extracts font-family declarations', () => {
    const css = `
      body { font-family: Inter, sans-serif; }
      h1 { font-family: "Georgia", serif; }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.fonts).toContain('Inter, sans-serif');
    expect(tokens.fonts).toContain('"Georgia", serif');
  });

  it('extracts font-size declarations', () => {
    const css = `
      .sm { font-size: 14px; }
      .lg { font-size: 2rem; }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.fontSizes).toContain('14px');
    expect(tokens.fontSizes).toContain('2rem');
  });

  it('extracts spacing (margin, padding, gap)', () => {
    const css = `
      .a { margin: 10px 20px; }
      .b { padding: 1rem; }
      .c { gap: 8px; }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.spacing).toContain('10px');
    expect(tokens.spacing).toContain('20px');
    expect(tokens.spacing).toContain('1rem');
    expect(tokens.spacing).toContain('8px');
  });

  it('extracts border-radius', () => {
    const css = `.card { border-radius: 8px; }`;
    const tokens = extractFromCSS(css);
    expect(tokens.radii).toContain('8px');
  });

  it('extracts box-shadow', () => {
    const css = `.card { box-shadow: 0 2px 4px rgba(0,0,0,0.1); }`;
    const tokens = extractFromCSS(css);
    expect(tokens.shadows.length).toBeGreaterThan(0);
    expect(tokens.shadows[0]).toContain('rgba(0,0,0,0.1)');
  });

  it('deduplicates values', () => {
    const css = `
      .a { color: #fff; }
      .b { color: #fff; }
      .c { color: #fff; }
    `;
    const tokens = extractFromCSS(css);
    expect(tokens.colors.filter((c) => c === '#fff').length).toBe(1);
  });

  it('returns empty tokens for empty input', () => {
    const tokens = extractFromCSS('');
    expect(tokens).toEqual(emptyTokens());
  });
});

// ---------------------------------------------------------------------------
// JSON extraction (Shopify settings)
// ---------------------------------------------------------------------------

describe('extractFromJSON', () => {
  it('extracts color settings from Shopify schema', () => {
    const json = JSON.stringify([
      {
        name: 'Colors',
        settings: [
          { type: 'color', id: 'color_primary', default: '#1a1a2e' },
          { type: 'color', id: 'color_secondary', default: '#e94560' },
        ],
      },
    ]);
    const tokens = extractFromJSON(json);
    expect(tokens.colors).toContain('#1a1a2e');
    expect(tokens.colors).toContain('#e94560');
  });

  it('extracts font_picker settings', () => {
    const json = JSON.stringify([
      {
        name: 'Typography',
        settings: [
          { type: 'font_picker', id: 'heading_font', default: 'Montserrat' },
          { type: 'font_picker', id: 'body_font', default: 'Open Sans' },
        ],
      },
    ]);
    const tokens = extractFromJSON(json);
    expect(tokens.fonts).toContain('Montserrat');
    expect(tokens.fonts).toContain('Open Sans');
  });

  it('extracts range settings with px unit', () => {
    const json = JSON.stringify([
      {
        name: 'Layout',
        settings: [
          { type: 'range', id: 'border_radius', default: 8, unit: 'px' },
          { type: 'range', id: 'font_size_base', default: 16, unit: 'px' },
          { type: 'range', id: 'section_spacing', default: 40, unit: 'px' },
        ],
      },
    ]);
    const tokens = extractFromJSON(json);
    expect(tokens.radii).toContain('8px');
    expect(tokens.fontSizes).toContain('16px');
    expect(tokens.spacing).toContain('40px');
  });

  it('returns empty tokens for invalid JSON', () => {
    const tokens = extractFromJSON('not valid json {{{');
    expect(tokens).toEqual(emptyTokens());
  });

  it('returns empty tokens for empty JSON array', () => {
    const tokens = extractFromJSON('[]');
    expect(tokens).toEqual(emptyTokens());
  });
});

// ---------------------------------------------------------------------------
// extractTokens (auto file type dispatch)
// ---------------------------------------------------------------------------

describe('extractTokens', () => {
  it('dispatches CSS to extractFromCSS', () => {
    const tokens = extractTokens('.x { color: #abc; }', 'css');
    expect(tokens.colors).toContain('#abc');
  });

  it('dispatches liquid to extractFromCSS (includes inline styles)', () => {
    const liquid = `
      <style>
        .hero { background: #112233; font-size: 24px; }
      </style>
    `;
    const tokens = extractTokens(liquid, 'liquid');
    expect(tokens.colors).toContain('#112233');
    expect(tokens.fontSizes).toContain('24px');
  });

  it('dispatches JSON to extractFromJSON', () => {
    const json = JSON.stringify([
      { name: 'C', settings: [{ type: 'color', id: 'c', default: '#abc' }] },
    ]);
    const tokens = extractTokens(json, 'json');
    expect(tokens.colors).toContain('#abc');
  });
});

// ---------------------------------------------------------------------------
// mergeTokens
// ---------------------------------------------------------------------------

describe('mergeTokens', () => {
  it('merges and deduplicates across token sets', () => {
    const a = { ...emptyTokens(), colors: ['#fff', '#000'], fonts: ['Arial'] };
    const b = { ...emptyTokens(), colors: ['#000', '#aaa'], fonts: ['Arial', 'Helvetica'] };
    const merged = mergeTokens(a, b);
    expect(merged.colors).toEqual(['#000', '#aaa', '#fff']);
    expect(merged.fonts).toEqual(['Arial', 'Helvetica']);
  });

  it('returns empty tokens when merging nothing', () => {
    const merged = mergeTokens();
    expect(merged).toEqual(emptyTokens());
  });

  it('returns single set unchanged', () => {
    const single = { ...emptyTokens(), colors: ['#f00'] };
    const merged = mergeTokens(single);
    expect(merged.colors).toEqual(['#f00']);
  });
});
