/**
 * Theme Map Lookup — matches a user prompt against the cached map
 * and returns the exact files and line ranges the agent should target.
 *
 * This replaces the entire per-request scout pipeline with a dictionary lookup.
 * Zero LLM calls. Sub-millisecond.
 */

import type { ThemeMap, ThemeMapFile, ThemeMapLookupResult } from './types';

interface ScoredFile {
  file: ThemeMapFile;
  score: number;
  matchedFeatures: Array<{
    name: string;
    lines: [number, number];
    description: string;
  }>;
}

// ── B1: Concept Expansion Dictionary ──────────────────────────────────
// Maps natural-language concepts to Shopify theme technical terms,
// bridging the vocabulary gap between merchant requests and theme code.

const CONCEPT_EXPANSION: Record<string, string[]> = {
  'bigger': ['font-size', 'padding', 'height', 'width', 'scale', 'margin', 'size'],
  'larger': ['font-size', 'padding', 'height', 'width', 'scale', 'margin', 'size'],
  'smaller': ['font-size', 'padding', 'height', 'width', 'compact', 'size'],
  'reduce': ['font-size', 'padding', 'height', 'width', 'compact'],
  'shrink': ['font-size', 'padding', 'height', 'width', 'compact'],
  'color': ['background', 'fill', 'border-color', 'gradient', 'swatch', 'colour'],
  'colour': ['background', 'fill', 'border-color', 'gradient', 'swatch', 'color'],
  'broken': ['display-none', 'opacity', 'visibility-hidden', 'error', 'undefined', 'null'],
  'bug': ['display-none', 'opacity', 'visibility-hidden', 'error', 'undefined'],
  'slow': ['lazy', 'defer', 'async', 'preload', 'critical', 'render-blocking', 'performance'],
  'performance': ['lazy', 'defer', 'async', 'preload', 'critical', 'render-blocking'],
  'hide': ['display-none', 'opacity', 'visibility-hidden', 'hidden', 'remove'],
  'remove': ['display-none', 'opacity', 'visibility-hidden', 'hidden', 'delete'],
  'invisible': ['display-none', 'opacity', 'visibility-hidden', 'hidden'],
  'spacing': ['margin', 'padding', 'gap', 'grid-gap'],
  'gap': ['margin', 'padding', 'gap', 'grid-gap', 'spacing'],
  'text': ['content', 'heading', 'description', 'label', 'placeholder', 'copy'],
  'copy': ['content', 'heading', 'description', 'label', 'placeholder', 'text'],
  'wording': ['content', 'heading', 'description', 'label', 'placeholder', 'text'],
  'image': ['thumbnail', 'media', 'gallery', 'srcset', 'lazy', 'responsive', 'photo', 'picture'],
  'photo': ['thumbnail', 'media', 'gallery', 'srcset', 'image', 'picture'],
  'picture': ['thumbnail', 'media', 'gallery', 'srcset', 'image', 'photo'],
  'mobile': ['breakpoint', 'media-query', 'responsive', 'tablet', 'viewport'],
  'responsive': ['breakpoint', 'media-query', 'mobile', 'tablet', 'viewport'],
  'animation': ['transition', 'transform', 'keyframes', 'animate', 'motion'],
  'motion': ['transition', 'transform', 'keyframes', 'animate', 'animation'],
  'announcement': ['announcement-bar', 'banner', 'header-notice', 'marquee'],
  'restock': ['awaiting', 'out-of-stock', 'sold-out', 'inventory', 'variant', 'back-in-stock'],
  'badge': ['indicator', 'stock-badge', 'sale-badge', 'label', 'tag'],
  'label': ['indicator', 'badge', 'tag', 'text'],
  'swatch': ['variant', 'option', 'picker', 'color-swatch', 'color'],
  'cart': ['basket', 'bag', 'checkout', 'line-item', 'add-to-cart'],
  'checkout': ['cart', 'payment', 'order', 'shipping'],
  'search': ['predictive', 'autocomplete', 'filter', 'search-bar'],
  'filter': ['facet', 'refine', 'sort', 'collection-filter'],
  'slider': ['carousel', 'slideshow', 'swiper', 'flickity', 'glide'],
  'carousel': ['slider', 'slideshow', 'swiper', 'flickity', 'glide'],
  'font': ['typography', 'typeface', 'font-family', 'font-size', 'heading', 'body-font'],
  'typography': ['font', 'typeface', 'font-family', 'font-size', 'heading'],
  'menu': ['navigation', 'nav', 'mega-menu', 'drawer', 'sidebar-menu'],
  'navigation': ['menu', 'nav', 'mega-menu', 'drawer', 'header'],
  'footer': ['footer-menu', 'newsletter', 'social-links', 'copyright'],
  'header': ['announcement', 'logo', 'navigation', 'menu', 'search-bar'],
};

/**
 * Expand user tokens with synonymous theme-development terms.
 * E.g. ["make", "image", "bigger"] → includes "thumbnail", "font-size", etc.
 */
export function expandQuery(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const expansions = CONCEPT_EXPANSION[token];
    if (expansions) {
      for (const exp of expansions) expanded.add(exp);
    }
  }
  return [...expanded];
}

// ── B2: Intent-Aware Scoring ──────────────────────────────────────────
// Detects user intent (styling, fixing, adding, removing, text editing)
// and boosts files/keywords that align with that intent.

const INTENT_BOOSTS: Array<{
  pattern: RegExp;
  fileBoosts: Array<{ pathPattern: RegExp; boost: number }>;
  keywordBoosts: Array<{ keywords: string[]; boost: number }>;
}> = [
  {
    pattern: /\b(style|bigger|smaller|color|colour|font|spacing|padding|margin|css|align|center|responsive|design)\b/i,
    fileBoosts: [
      { pathPattern: /assets\/.*\.css$/, boost: 5 },
      { pathPattern: /assets\/.*\.scss$/, boost: 5 },
    ],
    keywordBoosts: [{ keywords: ['font-size', 'padding', 'margin', 'color', 'background', 'border', 'width', 'height'], boost: 3 }],
  },
  {
    pattern: /\b(fix|broken|bug|not.?working|error|missing|invisible|disappeared)\b/i,
    fileBoosts: [
      { pathPattern: /assets\/.*\.js$/, boost: 4 },
    ],
    keywordBoosts: [{ keywords: ['function', 'addEventListener', 'querySelector', 'error', 'console'], boost: 3 }],
  },
  {
    pattern: /\b(add|create|new|insert|include)\b/i,
    fileBoosts: [
      { pathPattern: /templates\/.*\.json$/, boost: 4 },
      { pathPattern: /sections\/.*\.liquid$/, boost: 3 },
    ],
    keywordBoosts: [],
  },
  {
    pattern: /\b(remove|delete|hide|disable|turn.?off)\b/i,
    fileBoosts: [],
    keywordBoosts: [{ keywords: ['display-none', 'hidden', 'visibility', 'opacity'], boost: 4 }],
  },
  {
    pattern: /\b(change.?text|update.?copy|wording|heading|title|description|translate)\b/i,
    fileBoosts: [
      { pathPattern: /sections\/.*\.liquid$/, boost: 4 },
      { pathPattern: /locales\/.*\.json$/, boost: 4 },
    ],
    keywordBoosts: [{ keywords: ['content', 'heading', 'title', 'description', 'label'], boost: 3 }],
  },
];

function getIntentBoost(filePath: string, rawPrompt: string, fileKeywords: string[]): number {
  let boost = 0;
  for (const intent of INTENT_BOOSTS) {
    if (!intent.pattern.test(rawPrompt)) continue;
    for (const fb of intent.fileBoosts) {
      if (fb.pathPattern.test(filePath)) boost += fb.boost;
    }
    for (const kb of intent.keywordBoosts) {
      const kwLower = fileKeywords.map(k => k.toLowerCase());
      if (kb.keywords.some(k => kwLower.includes(k))) boost += kb.boost;
    }
  }
  return boost;
}

/**
 * Look up files relevant to a user prompt from the cached theme map.
 * Uses multi-signal scoring: keyword overlap, purpose match, feature match.
 */
export function lookupThemeMap(
  map: ThemeMap,
  userPrompt: string,
  options?: {
    activeFilePath?: string;
    maxTargets?: number;
  },
): ThemeMapLookupResult {
  const maxTargets = options?.maxTargets ?? 15;
  const tokens = tokenize(userPrompt);

  if (tokens.length === 0) {
    return { targets: [], related: [], confident: false, conventions: map.globalPatterns ?? [] };
  }

  const expandedTokens = expandQuery(tokens);
  const scored: ScoredFile[] = [];

  for (const file of Object.values(map.files)) {
    const result = scoreFile(file, expandedTokens, userPrompt);
    if (result.score > 0) {
      scored.push(result);
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Boost active file to top if present
  if (options?.activeFilePath) {
    const activeIdx = scored.findIndex(s => s.file.path === options.activeFilePath);
    if (activeIdx > 0) {
      const [active] = scored.splice(activeIdx, 1);
      scored.unshift(active);
    }
  }

  const topTargets = scored.slice(0, maxTargets);
  const targets = topTargets.map(s => ({
    path: s.file.path,
    purpose: s.file.purpose,
    features: s.matchedFeatures,
    patterns: s.file.patterns,
  }));

  // Related files: dependsOn + renderedBy of top targets (deduped)
  const targetPaths = new Set(targets.map(t => t.path));
  const relatedSet = new Set<string>();
  for (const t of topTargets) {
    for (const dep of t.file.dependsOn) {
      if (!targetPaths.has(dep)) relatedSet.add(dep);
    }
    for (const ref of t.file.renderedBy) {
      if (!targetPaths.has(ref)) relatedSet.add(ref);
    }
  }

  const confident = topTargets.length > 0 && topTargets[0].score >= 3;

  return {
    targets,
    related: [...relatedSet].slice(0, 10),
    confident,
    conventions: map.globalPatterns ?? [],
  };
}

/**
 * Format a lookup result into a context section for the LLM prompt.
 */
export function formatLookupResult(result: ThemeMapLookupResult): string {
  if (result.targets.length === 0) {
    return '## Theme Intelligence\nNo relevant files identified in theme map.';
  }

  const lines: string[] = ['## Theme Intelligence Map (cached)'];
  lines.push(`Confidence: ${result.confident ? 'HIGH' : 'MEDIUM'}`);
  lines.push('');

  for (const target of result.targets) {
    lines.push(`### ${target.path}`);
    lines.push(`Purpose: ${target.purpose}`);
    if (target.patterns?.length > 0) {
      lines.push('Patterns:');
      for (const p of target.patterns) {
        lines.push(`  - ${p}`);
      }
    }
    if (target.features.length > 0) {
      lines.push('Key regions:');
      for (const f of target.features) {
        lines.push(`  - Lines ${f.lines[0]}-${f.lines[1]}: ${f.description}`);
      }
    }
    lines.push('');
  }

  if (result.conventions?.length > 0) {
    lines.push('### Theme Conventions');
    for (const c of result.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  if (result.related.length > 0) {
    lines.push('### Related files (may need reading)');
    for (const r of result.related) {
      lines.push(`  - ${r}`);
    }
  }

  return lines.join('\n');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function scoreFile(file: ThemeMapFile, tokens: string[], rawPrompt: string): ScoredFile {
  let score = 0;
  const matchedFeatures: ScoredFile['matchedFeatures'] = [];

  const promptLower = rawPrompt.toLowerCase();

  // 1. Path match — direct file mentions in the prompt
  const pathLower = file.path.toLowerCase();
  if (promptLower.includes(pathLower) || promptLower.includes(pathLower.split('/').pop() ?? '')) {
    score += 10;
  }

  // 2. Purpose match — tokens overlap with LLM summary (preferred) or programmatic purpose
  const purposeLower = (file.llmSummary ?? file.purpose).toLowerCase();
  for (const token of tokens) {
    if (purposeLower.includes(token)) score += 1;
  }

  // 3. Pattern match — tokens overlap with file patterns
  for (const pattern of file.patterns) {
    const patternLower = pattern.toLowerCase();
    for (const token of tokens) {
      if (patternLower.includes(token)) score += 0.5;
    }
  }

  // 4. Feature match — the core scoring: keyword overlap with features
  for (const [name, feature] of Object.entries(file.features)) {
    let featureScore = 0;
    const descLower = feature.description.toLowerCase();

    for (const token of tokens) {
      if (descLower.includes(token)) featureScore += 2;
      if (feature.keywords.some(k => k.toLowerCase().includes(token))) featureScore += 3;
    }

    if (featureScore > 0) {
      score += featureScore;
      matchedFeatures.push({
        name,
        lines: feature.lines,
        description: feature.description,
      });
    }
  }

  // Sort matched features by relevance (highest scoring first)
  matchedFeatures.sort((a, b) => {
    const aKeywordHits = tokens.filter(t =>
      a.description.toLowerCase().includes(t),
    ).length;
    const bKeywordHits = tokens.filter(t =>
      b.description.toLowerCase().includes(t),
    ).length;
    return bKeywordHits - aKeywordHits;
  });

  // B2: Intent-aware boost — use file keywords from all features
  const allFileKeywords = Object.values(file.features).flatMap(f => f.keywords);
  score += getIntentBoost(file.path, rawPrompt, allFileKeywords);

  return { file, score, matchedFeatures };
}
