import { describe, it, expect } from 'vitest';
import {
  generateColorRamp,
  identifyBrandColors,
} from '../color-ramp-generator';

describe('generateColorRamp', () => {
  it('returns 11 steps for a valid hex color', () => {
    const ramp = generateColorRamp('#3B82F6');
    expect(ramp).toHaveLength(11);
    expect(ramp.map((r) => r.step)).toEqual([
      50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
    ]);
  });

  it('returns ColorRampEntry with hex, oklch, and contrast ratios', () => {
    const ramp = generateColorRamp('#3B82F6');
    const entry = ramp.find((r) => r.step === 500)!;
    expect(entry.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(entry.oklch).toMatchObject({
      l: expect.any(Number),
      c: expect.any(Number),
      h: expect.any(Number),
    });
    expect(entry.contrastOnWhite).toBeGreaterThan(0);
    expect(entry.contrastOnBlack).toBeGreaterThan(0);
  });

  it('preserves chroma and hue across steps', () => {
    const ramp = generateColorRamp('#ff0000');
    const cValues = ramp.map((r) => r.oklch.c);
    const hValues = ramp.map((r) => r.oklch.h);
    // All steps should share the same c and h (within float tolerance)
    expect(new Set(cValues.map((c) => Math.round(c * 100))).size).toBeLessThanOrEqual(2);
    expect(new Set(hValues.map((h) => Math.round(h * 10))).size).toBeLessThanOrEqual(2);
  });

  it('returns empty array for invalid color', () => {
    expect(generateColorRamp('not-a-color')).toEqual([]);
    expect(generateColorRamp('')).toEqual([]);
  });

  it('accepts rgb() and hsl() colors', () => {
    const hexRamp = generateColorRamp('#3B82F6');
    const rgbRamp = generateColorRamp('rgb(59, 130, 246)');
    expect(rgbRamp).toHaveLength(11);
    expect(rgbRamp[5].hex).toBe(hexRamp[5].hex);
  });

  it('respects steps parameter when provided', () => {
    const ramp = generateColorRamp('#3B82F6', 3);
    expect(ramp).toHaveLength(3);
    expect(ramp.map((r) => r.step)).toEqual([50, 100, 200]);
  });
});

describe('identifyBrandColors', () => {
  it('identifies tokens with primary, accent, secondary, brand, button, cta', () => {
    const tokens = [
      { name: 'color-primary', value: '#3B82F6', source: 'theme.css' },
      { name: 'accent-color', value: '#10B981', source: 'theme.css' },
      { name: 'random-gray', value: '#6B7280', source: 'theme.css' },
    ];
    const result = identifyBrandColors(tokens);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain('color-primary');
    expect(result.map((r) => r.name)).toContain('accent-color');
    expect(result.map((r) => r.name)).not.toContain('random-gray');
  });

  it('identifies Dawn patterns: color_schemes.*.settings.background|button', () => {
    const tokens = [
      { name: 'color_schemes.dawn.settings.background', value: '#ffffff', source: 'config.json' },
      { name: 'color_schemes.dawn.settings.button', value: '#000000', source: 'config.json' },
    ];
    const result = identifyBrandColors(tokens);
    expect(result).toHaveLength(2);
  });

  it('identifies T4S patterns: primary_color, second_color, accent_color', () => {
    const tokens = [
      { name: 'primary_color', value: '#2563EB', source: 'settings.json' },
      { name: 'second_color', value: '#64748B', source: 'settings.json' },
    ];
    const result = identifyBrandColors(tokens);
    expect(result).toHaveLength(2);
  });

  it('filters out tokens with invalid color values', () => {
    const tokens = [
      { name: 'primary', value: '#3B82F6', source: 'theme.css' },
      { name: 'accent', value: 'var(--some-var)', source: 'theme.css' },
      { name: 'brand', value: '{{ settings.color }}', source: 'liquid' },
    ];
    const result = identifyBrandColors(tokens);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('primary');
  });

  it('deduplicates by name:value', () => {
    const tokens = [
      { name: 'primary', value: '#3B82F6', source: 'a.css' },
      { name: 'primary', value: '#3B82F6', source: 'b.css' },
    ];
    const result = identifyBrandColors(tokens);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(identifyBrandColors([])).toEqual([]);
  });
});
