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
    return { targets: [], related: [], confident: false };
  }

  const scored: ScoredFile[] = [];

  for (const file of Object.values(map.files)) {
    const result = scoreFile(file, tokens, userPrompt);
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
    if (target.features.length > 0) {
      lines.push('Key regions:');
      for (const f of target.features) {
        lines.push(`  - Lines ${f.lines[0]}-${f.lines[1]}: ${f.description}`);
      }
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

  // 2. Purpose match — tokens overlap with the file's purpose
  const purposeLower = file.purpose.toLowerCase();
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

  return { file, score, matchedFeatures };
}
