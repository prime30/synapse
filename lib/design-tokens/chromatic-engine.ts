/**
 * EPIC 16 — Chromatic Engine
 * Analyzes theme file contents (CSS, settings_data.json, Liquid schema) to extract
 * the top 3 dominant colors and generate CSS custom properties for IDE ambient theming.
 */

/** A color with multiple representations and usage frequency. */
export interface ChromaticColor {
  r: number; g: number; b: number;
  hex: string;
  oklch: { l: number; c: number; h: number };
  hsl: { h: number; s: number; l: number };
  frequency: number;
}

/** The three dominant colors extracted from a theme. */
export interface ChromaticPalette {
  primary: ChromaticColor;
  secondary: ChromaticColor;
  accent: ChromaticColor;
  source: 'css' | 'settings' | 'schema' | 'mixed';
}

/** CSS custom properties for ambient theming. */
export interface ChromaticCSSVars {
  '--ide-ambient-primary': string;
  '--ide-ambient-secondary': string;
  '--ide-ambient-accent': string;
  '--ide-ambient-primary-hsl': string;
  '--ide-ambient-secondary-hsl': string;
  '--ide-ambient-accent-hsl': string;
}

// Patterns & constants
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)/g;
const HSL_RE = /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*[\d.]+\s*)?\)/g;
const SCHEMA_RE = /\{%[-]?\s*schema\s*[-]?%\}([\s\S]*?)\{%[-]?\s*endschema\s*[-]?%\}/gi;
const CLUSTER_THRESHOLD = 35;
const DEFAULT_RGB: [number, number, number][] = [[66, 99, 235], [99, 102, 241], [168, 85, 247]];

// Rounding helpers
function r4(n: number): number { return Math.round(n * 10000) / 10000; }
function r1(n: number): number { return Math.round(n * 10) / 10; }

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

/** Convert a hex color string (#rgb, #rrggbb, #rgba, #rrggbbaa) to RGB. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 4) h = h.slice(0, 3);
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Convert RGB (0-255) to HSL (h: 0-360, s: 0-100, l: 0-100). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100, ln = l / 100;
  if (sn === 0) { const v = Math.round(ln * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q, hn = h / 360;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

function linearize(c: number): number {
  const cn = c / 255;
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}

/** Convert RGB (0-255) to Oklch via the Oklab perceptual model. */
export function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const lr = linearize(r), lg = linearize(g), lb = linearize(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bk * bk);
  let H = Math.atan2(bk, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  return { l: r4(L), c: r4(C), h: r1(H) };
}

/** Euclidean distance between two colors in RGB space. */
export function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Format an Oklch value as a CSS `oklch()` string. */
export function toOklchString(oklch: { l: number; c: number; h: number }): string {
  return `oklch(${oklch.l} ${oklch.c} ${oklch.h})`;
}

/** Format an HSL value as a CSS `hsl()` string. */
export function toHslString(hsl: { h: number; s: number; l: number }): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

// Color extraction helpers
type Src = 'css' | 'settings' | 'schema';
interface RawColor { r: number; g: number; b: number; source: Src }

function matchAll(content: string, re: RegExp): RegExpExecArray[] {
  const copy = new RegExp(re.source, re.flags);
  const results: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = copy.exec(content)) !== null) results.push(m);
  return results;
}

function extractColorsFromCSS(content: string): RawColor[] {
  const out: RawColor[] = [];
  for (const m of matchAll(content, HEX_RE)) {
    const { r, g, b } = hexToRgb(m[0]); out.push({ r, g, b, source: 'css' });
  }
  for (const m of matchAll(content, RGB_RE)) out.push({ r: +m[1], g: +m[2], b: +m[3], source: 'css' });
  for (const m of matchAll(content, HSL_RE)) {
    const { r, g, b } = hslToRgb(+m[1], +m[2], +m[3]); out.push({ r, g, b, source: 'css' });
  }
  return out;
}

function extractColorsFromSettings(content: string): RawColor[] {
  try { return walkJsonForColors(JSON.parse(content), 'settings'); } catch { return []; }
}

function walkJsonForColors(obj: unknown, source: Src): RawColor[] {
  const out: RawColor[] = [];
  if (typeof obj === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(obj.trim())) {
    const { r, g, b } = hexToRgb(obj.trim()); out.push({ r, g, b, source });
  } else if (Array.isArray(obj)) {
    for (const item of obj) out.push(...walkJsonForColors(item, source));
  } else if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) out.push(...walkJsonForColors(val, source));
  }
  return out;
}

function extractColorsFromLiquid(content: string): RawColor[] {
  const out: RawColor[] = [];
  let stripped = content;
  for (const m of matchAll(content, SCHEMA_RE)) {
    try { out.push(...walkJsonForColors(JSON.parse(m[1]), 'schema')); } catch { /* skip */ }
    stripped = stripped.replace(m[0], '');
  }
  out.push(...extractColorsFromCSS(stripped));
  return out;
}

// Clustering
interface ColorCluster { center: { r: number; g: number; b: number }; count: number; sources: Set<Src> }

function isNeutral(r: number, g: number, b: number): boolean {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) < 20 || lum < 0.05 || lum > 0.95;
}

function buildClusters(colors: RawColor[]): ColorCluster[] {
  const clusters: ColorCluster[] = [];
  for (const color of colors) {
    const match = clusters.find(cl => colorDistance(color, cl.center) < CLUSTER_THRESHOLD);
    if (match) {
      const t = match.count + 1;
      match.center = {
        r: Math.round((match.center.r * match.count + color.r) / t),
        g: Math.round((match.center.g * match.count + color.g) / t),
        b: Math.round((match.center.b * match.count + color.b) / t),
      };
      match.count = t;
      match.sources.add(color.source);
    } else {
      clusters.push({ center: { ...color }, count: 1, sources: new Set([color.source]) });
    }
  }
  return clusters;
}

function clusterColors(rawColors: RawColor[]): ColorCluster[] {
  const chromatic = rawColors.filter(c => !isNeutral(c.r, c.g, c.b));
  let clusters = buildClusters(chromatic.length > 0 ? chromatic : rawColors);
  if (clusters.length === 0) clusters = buildClusters(rawColors);
  return clusters.sort((a, b) => b.count - a.count);
}

function buildChromaticColor(r: number, g: number, b: number, freq: number): ChromaticColor {
  return { r, g, b, hex: rgbToHex(r, g, b), oklch: rgbToOklch(r, g, b), hsl: rgbToHsl(r, g, b), frequency: freq };
}

function resolveSource(clusters: ColorCluster[]): ChromaticPalette['source'] {
  const all = new Set<string>();
  for (const c of clusters) Array.from(c.sources).forEach(s => all.add(s));
  if (all.size > 1) return 'mixed';
  if (all.has('settings')) return 'settings';
  if (all.has('schema')) return 'schema';
  return 'css';
}

function fromCluster(cl: ColorCluster): ChromaticColor {
  return buildChromaticColor(cl.center.r, cl.center.g, cl.center.b, cl.count);
}

/**
 * Extract dominant colors from theme file contents.
 *
 * Analyzes CSS files, `settings_data.json`, and Liquid schema blocks to find
 * the three most prominent colors. Neutrals are deprioritised. Falls back to
 * defaults when no usable chromatic colors are found.
 *
 * @param files - Theme files with their string content.
 */
export function extractDominantColors(files: { path: string; content: string }[]): ChromaticPalette {
  const raw: RawColor[] = [];
  for (const f of files) {
    const ext = f.path.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'css' || ext === 'scss') raw.push(...extractColorsFromCSS(f.content));
    else if (ext === 'json') raw.push(...extractColorsFromSettings(f.content));
    else if (ext === 'liquid') raw.push(...extractColorsFromLiquid(f.content));
  }
  if (raw.length === 0) return getDefaultPalette();

  const clusters = clusterColors(raw);
  if (clusters.length === 0) return getDefaultPalette();

  const primary = fromCluster(clusters[0]);
  const secondary = clusters.length >= 2
    ? fromCluster(clusters[1])
    : buildChromaticColor(Math.round(primary.r * 0.8), Math.round(primary.g * 0.8), Math.round(primary.b * 0.8), 0);
  const compHsl = { h: (primary.hsl.h + 180) % 360, s: primary.hsl.s, l: primary.hsl.l };
  const comp = hslToRgb(compHsl.h, compHsl.s, compHsl.l);
  const accent = clusters.length >= 3 ? fromCluster(clusters[2]) : buildChromaticColor(comp.r, comp.g, comp.b, 0);

  return { primary, secondary, accent, source: resolveSource(clusters.slice(0, 3)) };
}

/**
 * Generate CSS custom property values from a palette.
 *
 * @param palette   - The chromatic palette to convert.
 * @param intensity - 0–1 multiplier on oklch chroma. Lower = subtler tinting.
 */
export function generateChromaticVars(palette: ChromaticPalette, intensity = 1): ChromaticCSSVars {
  const s = Math.max(0, Math.min(1, intensity));
  const ok = (c: ChromaticColor) => toOklchString({ l: c.oklch.l, c: r4(c.oklch.c * s), h: c.oklch.h });
  const hs = (c: ChromaticColor) => toHslString(c.hsl);
  return {
    '--ide-ambient-primary': ok(palette.primary),
    '--ide-ambient-secondary': ok(palette.secondary),
    '--ide-ambient-accent': ok(palette.accent),
    '--ide-ambient-primary-hsl': hs(palette.primary),
    '--ide-ambient-secondary-hsl': hs(palette.secondary),
    '--ide-ambient-accent-hsl': hs(palette.accent),
  };
}

/** Default palette (muted indigo/violet) for when no theme colors are available. */
export function getDefaultPalette(): ChromaticPalette {
  const [p, s, a] = DEFAULT_RGB;
  return {
    primary: buildChromaticColor(p[0], p[1], p[2], 0),
    secondary: buildChromaticColor(s[0], s[1], s[2], 0),
    accent: buildChromaticColor(a[0], a[1], a[2], 0),
    source: 'css',
  };
}
