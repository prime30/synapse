import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHsl,
  rgbToOklch,
  colorDistance,
  toOklchString,
  toHslString,
  extractDominantColors,
  generateChromaticVars,
  getDefaultPalette,
} from '../chromatic-engine';

// ---------------------------------------------------------------------------
// Color math utilities
// ---------------------------------------------------------------------------

describe('hexToRgb', () => {
  it('converts 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#003366')).toEqual({ r: 0, g: 51, b: 102 });
  });

  it('converts 3-digit hex', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#0af')).toEqual({ r: 0, g: 170, b: 255 });
  });

  it('handles 8-digit hex (strips alpha)', () => {
    expect(hexToRgb('#ff000080')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('handles 4-digit hex (strips alpha)', () => {
    expect(hexToRgb('#f00a')).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure green', () => {
    const hsl = rgbToHsl(0, 128, 0);
    expect(hsl.h).toBe(120);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(25);
  });

  it('converts grey (achromatic)', () => {
    const hsl = rgbToHsl(128, 128, 128);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(50);
  });
});

describe('rgbToOklch', () => {
  it('returns values in expected ranges', () => {
    const oklch = rgbToOklch(66, 99, 235);
    expect(oklch.l).toBeGreaterThan(0);
    expect(oklch.l).toBeLessThanOrEqual(1);
    expect(oklch.c).toBeGreaterThanOrEqual(0);
    expect(oklch.h).toBeGreaterThanOrEqual(0);
    expect(oklch.h).toBeLessThan(360);
  });

  it('black has zero lightness', () => {
    const oklch = rgbToOklch(0, 0, 0);
    expect(oklch.l).toBe(0);
    expect(oklch.c).toBe(0);
  });
});

describe('colorDistance', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistance({ r: 50, g: 100, b: 200 }, { r: 50, g: 100, b: 200 })).toBe(0);
  });

  it('returns correct distance for known pair', () => {
    const dist = colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(dist).toBeCloseTo(Math.sqrt(3 * 255 * 255), 1);
  });
});

describe('toOklchString / toHslString', () => {
  it('formats oklch correctly', () => {
    expect(toOklchString({ l: 0.5, c: 0.12, h: 230 })).toBe('oklch(0.5 0.12 230)');
  });

  it('formats hsl correctly', () => {
    expect(toHslString({ h: 210, s: 80, l: 50 })).toBe('hsl(210, 80%, 50%)');
  });
});

// ---------------------------------------------------------------------------
// extractDominantColors
// ---------------------------------------------------------------------------

describe('extractDominantColors', () => {
  it('returns default palette when given no files', () => {
    const palette = extractDominantColors([]);
    const defaultPalette = getDefaultPalette();
    expect(palette.primary.hex).toBe(defaultPalette.primary.hex);
    expect(palette.secondary.hex).toBe(defaultPalette.secondary.hex);
  });

  it('returns default palette when files have no colors', () => {
    const palette = extractDominantColors([
      { path: 'style.css', content: 'body { display: flex; }' },
    ]);
    expect(palette).toEqual(getDefaultPalette());
  });

  it('extracts dominant hex color from CSS', () => {
    const css = `
      :root { --primary: #3B82F6; }
      .btn { color: #3B82F6; background: #3B82F6; }
      .header { color: #3B82F6; }
      .link { color: #EF4444; }
      .accent { color: #10B981; }
    `;
    const palette = extractDominantColors([{ path: 'theme.css', content: css }]);
    // #3B82F6 (blue) appears 4 times — should be primary
    expect(palette.primary.hex).toBe('#3b82f6');
    expect(palette.primary.frequency).toBeGreaterThanOrEqual(4);
  });

  it('extracts colors from settings_data.json', () => {
    const json = JSON.stringify({
      current: {
        color_schemes: {
          scheme1: {
            settings: {
              background: '#ffffff',
              text: '#1a1a2e',
              button: '#e94560',
              accent: '#0f3460',
            },
          },
        },
      },
    });
    const palette = extractDominantColors([{ path: 'settings_data.json', content: json }]);
    // Should find at least the non-neutral colors
    expect(palette.primary.frequency).toBeGreaterThanOrEqual(1);
    expect(palette.source).toBe('settings');
  });

  it('extracts colors from Liquid schema blocks', () => {
    const liquid = `
      {% schema %}
      {
        "settings": [
          { "type": "color", "id": "heading_color", "default": "#2D3436" },
          { "type": "color", "id": "accent_color", "default": "#6C5CE7" }
        ]
      }
      {% endschema %}
    `;
    const palette = extractDominantColors([{ path: 'section.liquid', content: liquid }]);
    expect(palette.source).toBe('schema');
  });

  it('handles mixed sources and reports "mixed" source', () => {
    const css = '.a { color: #e94560; } .b { color: #e94560; } .c { color: #e94560; }';
    const json = JSON.stringify({ current: { bg: '#0f3460', text: '#0f3460' } });
    const palette = extractDominantColors([
      { path: 'theme.css', content: css },
      { path: 'settings_data.json', content: json },
    ]);
    expect(palette.source).toBe('mixed');
  });

  it('computes complementary accent when only 2 clusters exist', () => {
    const css = `
      .a { color: #3B82F6; } .b { color: #3B82F6; }
      .c { color: #EF4444; } .d { color: #EF4444; }
    `;
    const palette = extractDominantColors([{ path: 'theme.css', content: css }]);
    // accent should be a computed complementary — just verify it exists
    expect(palette.accent.hex).toBeDefined();
    expect(palette.accent.frequency).toBe(0); // computed, not from source
  });

  it('handles monochromatic (all-neutral) themes with defaults', () => {
    const css = `
      body { color: #111111; background: #fafafa; }
      .text { color: #222222; }
    `;
    const palette = extractDominantColors([{ path: 'theme.css', content: css }]);
    // All colors are near-black/white — should still return a palette
    expect(palette.primary).toBeDefined();
    expect(palette.secondary).toBeDefined();
    expect(palette.accent).toBeDefined();
  });

  it('extracts rgb() and hsl() colors from CSS', () => {
    const css = `
      .a { color: rgb(220, 50, 50); }
      .b { color: rgb(220, 50, 50); }
      .c { background: hsl(210, 80%, 50%); }
    `;
    const palette = extractDominantColors([{ path: 'theme.css', content: css }]);
    // rgb(220,50,50) appears twice — should be primary
    expect(palette.primary.r).toBeCloseTo(220, -1);
  });
});

// ---------------------------------------------------------------------------
// generateChromaticVars
// ---------------------------------------------------------------------------

describe('generateChromaticVars', () => {
  it('generates all 6 CSS custom properties', () => {
    const palette = getDefaultPalette();
    const vars = generateChromaticVars(palette);
    expect(vars['--ide-ambient-primary']).toMatch(/^oklch\(/);
    expect(vars['--ide-ambient-secondary']).toMatch(/^oklch\(/);
    expect(vars['--ide-ambient-accent']).toMatch(/^oklch\(/);
    expect(vars['--ide-ambient-primary-hsl']).toMatch(/^hsl\(/);
    expect(vars['--ide-ambient-secondary-hsl']).toMatch(/^hsl\(/);
    expect(vars['--ide-ambient-accent-hsl']).toMatch(/^hsl\(/);
  });

  it('applies intensity scaling to chroma', () => {
    const palette = getDefaultPalette();
    const full = generateChromaticVars(palette, 1);
    const half = generateChromaticVars(palette, 0.5);
    // oklch chroma value should be lower at half intensity
    expect(full['--ide-ambient-primary']).not.toBe(half['--ide-ambient-primary']);
  });

  it('clamps intensity to 0-1 range', () => {
    const palette = getDefaultPalette();
    const zero = generateChromaticVars(palette, -5);
    const full = generateChromaticVars(palette, 99);
    // intensity 0 → chroma 0
    expect(zero['--ide-ambient-primary']).toContain(' 0 ');
    // intensity clamped to 1 → same as default
    expect(full['--ide-ambient-primary']).toBe(
      generateChromaticVars(palette, 1)['--ide-ambient-primary'],
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaultPalette
// ---------------------------------------------------------------------------

describe('getDefaultPalette', () => {
  it('returns a valid palette with all three colors', () => {
    const palette = getDefaultPalette();
    expect(palette.primary.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.secondary.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.accent.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.source).toBe('css');
  });

  it('returns consistent values across calls', () => {
    const a = getDefaultPalette();
    const b = getDefaultPalette();
    expect(a).toEqual(b);
  });
});
