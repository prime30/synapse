/**
 * Phase 5.1: Unified Style Profile Builder
 *
 * Merges four style/pattern systems (design tokens, style detection,
 * pattern learning, developer memory) into a single injectable document
 * for agent system prompts.
 */

import { DesignSystemContextProvider } from '@/lib/design-tokens/agent-integration/context-provider';
import { detectStyle, formatStyleGuide } from '@/lib/ai/style-detector';
import type { StyleProfile } from '@/lib/ai/style-detector';
import {
  rowToMemoryEntry,
  filterActiveMemories,
  formatMemoryForPrompt,
} from '@/lib/ai/developer-memory';
import type { MemoryRow } from '@/lib/ai/developer-memory';
import { createClient } from '@/lib/supabase/server';
import type { FileContext, UserPreference } from '@/lib/types/agent';

// ── Types ─────────────────────────────────────────────────────────────

export interface ProfileStats {
  tokenCount: number;
  styleRuleCount: number;
  patternCount: number;
  memoryCount: number;
  conflictResolutions: number;
}

export interface UnifiedStyleProfile {
  content: string;
  stats: ProfileStats;
}

// ── Cache ─────────────────────────────────────────────────────────────

const profileCache = new Map<string, { value: UnifiedStyleProfile; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const MAX_STYLE_DETECTION_FILES = 20;
const PATTERN_CONFIDENCE_THRESHOLD = 0.7;

function cacheKey(projectId: string, userId: string): string {
  return `${projectId}:${userId}`;
}

export function invalidateStyleProfileCache(projectId: string): void {
  for (const key of profileCache.keys()) {
    if (key.startsWith(`${projectId}:`)) {
      profileCache.delete(key);
    }
  }
}

// ── Main builder ──────────────────────────────────────────────────────

export async function buildUnifiedStyleProfile(
  projectId: string,
  userId: string,
  files: FileContext[],
): Promise<UnifiedStyleProfile> {
  const key = cacheKey(projectId, userId);
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const stats: ProfileStats = {
    tokenCount: 0,
    styleRuleCount: 0,
    patternCount: 0,
    memoryCount: 0,
    conflictResolutions: 0,
  };

  const sections: string[] = ['## Project Style Profile\n'];

  // 1. Design tokens
  const designContext = await fetchDesignTokens(projectId);
  if (designContext) {
    sections.push('### Design System Tokens');
    sections.push(designContext);
    sections.push('');
    stats.tokenCount = (designContext.match(/^- /gm) ?? []).length;
  }

  // 2. Code style detection
  const sampledFiles = sampleFiles(files, MAX_STYLE_DETECTION_FILES);
  let detectedProfile: StyleProfile | null = null;
  let styleGuide = '';
  try {
    if (sampledFiles.length > 0) {
      detectedProfile = detectStyle(
        sampledFiles.map((f) => ({ path: f.fileName, content: f.content })),
      );
      styleGuide = formatStyleGuide(detectedProfile);
      stats.styleRuleCount = 8; // fixed fields in StyleProfile
    }
  } catch (err) {
    console.warn('[StyleProfileBuilder] Style detection failed:', err);
  }

  // 3. Learned patterns
  const patterns = await fetchLearnedPatterns(userId);
  stats.patternCount = patterns.length;

  // 4. Developer memory
  const { formatted: memoryFormatted, count: memoryCount } =
    await fetchDeveloperMemory(projectId, userId);
  stats.memoryCount = memoryCount;

  // 5. Conflict resolution — learned patterns override detected style
  const { mergedGuide, conflicts } = resolveConflicts(
    detectedProfile,
    styleGuide,
    patterns,
  );
  stats.conflictResolutions = conflicts;

  if (mergedGuide) {
    sections.push('### Code Style Rules');
    sections.push(mergedGuide);
    sections.push('');
  }

  if (patterns.length > 0) {
    sections.push('### Learned Patterns');
    for (const p of patterns) {
      const conf = (p.confidence * 100).toFixed(0);
      sections.push(`- ${p.key} (${conf}% confidence, ${p.observation_count} observations)`);
    }
    sections.push('');
  }

  if (memoryFormatted) {
    sections.push('### Developer Memory');
    sections.push(memoryFormatted);
    sections.push('');
  }

  const result: UnifiedStyleProfile = {
    content: sections.join('\n').trim(),
    stats,
  };

  profileCache.set(key, { value: result, ts: Date.now() });
  return result;
}

// ── Data fetchers (each wrapped in try/catch) ─────────────────────────

async function fetchDesignTokens(projectId: string): Promise<string> {
  try {
    const provider = new DesignSystemContextProvider();
    return await provider.getDesignContext(projectId);
  } catch (err) {
    console.warn('[StyleProfileBuilder] Design token fetch failed:', err);
    return '';
  }
}

async function fetchLearnedPatterns(userId: string): Promise<UserPreference[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .in('category', ['coding_style', 'theme_style'])
      .order('confidence', { ascending: false });

    if (error) {
      console.warn('[StyleProfileBuilder] Pattern query failed:', error.message);
      return [];
    }
    return (data as UserPreference[]) ?? [];
  } catch (err) {
    console.warn('[StyleProfileBuilder] Pattern fetch failed:', err);
    return [];
  }
}

async function fetchDeveloperMemory(
  projectId: string,
  userId: string,
): Promise<{ formatted: string; count: number }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('developer_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.warn('[StyleProfileBuilder] Memory query failed:', error.message);
      return { formatted: '', count: 0 };
    }

    if (!data || data.length === 0) return { formatted: '', count: 0 };

    const entries = (data as MemoryRow[]).map(rowToMemoryEntry);
    const active = filterActiveMemories(entries);
    const formatted = formatMemoryForPrompt(active);
    return { formatted, count: active.length };
  } catch (err) {
    console.warn('[StyleProfileBuilder] Memory fetch failed:', err);
    return { formatted: '', count: 0 };
  }
}

// ── Conflict resolution ───────────────────────────────────────────────

interface ConflictResult {
  mergedGuide: string;
  conflicts: number;
}

/**
 * When a learned pattern with sufficient confidence disagrees with the
 * detected StyleProfile, the learned pattern wins. We patch the style
 * guide text to reflect overrides and count conflicts resolved.
 */
function resolveConflicts(
  detected: StyleProfile | null,
  styleGuide: string,
  patterns: UserPreference[],
): ConflictResult {
  if (!detected || !styleGuide) {
    return { mergedGuide: styleGuide, conflicts: 0 };
  }

  let merged = styleGuide;
  let conflicts = 0;

  const highConfidence = patterns.filter(
    (p) => p.confidence >= PATTERN_CONFIDENCE_THRESHOLD,
  );

  for (const pref of highConfidence) {
    const key = pref.key.toLowerCase();

    // Quote style conflict
    if (key.includes('single quote') && detected.quoteStyle !== 'single') {
      merged = merged.replace(/Quote style: \w+/, 'Quote style: single (learned override)');
      conflicts++;
    } else if (key.includes('double quote') && detected.quoteStyle !== 'double') {
      merged = merged.replace(/Quote style: \w+/, 'Quote style: double (learned override)');
      conflicts++;
    }

    // Indentation conflict
    if (key.includes('tab') && key.includes('indent') && detected.indentation !== 'tabs') {
      merged = merged.replace(/Indentation: [\w-]+/, 'Indentation: tabs (learned override)');
      conflicts++;
    } else if (key.includes('2 space') && detected.indentation !== '2-spaces') {
      merged = merged.replace(/Indentation: [\w-]+/, 'Indentation: 2-spaces (learned override)');
      conflicts++;
    } else if (key.includes('4 space') && detected.indentation !== '4-spaces') {
      merged = merged.replace(/Indentation: [\w-]+/, 'Indentation: 4-spaces (learned override)');
      conflicts++;
    }

    // CSS naming conflict
    if (key.includes('bem') && detected.cssNamingConvention !== 'BEM') {
      merged = merged.replace(/CSS naming: [\w-]+/, 'CSS naming: BEM (learned override)');
      conflicts++;
    } else if (key.includes('camelcase') && detected.cssNamingConvention !== 'camelCase') {
      merged = merged.replace(/CSS naming: [\w-]+/, 'CSS naming: camelCase (learned override)');
      conflicts++;
    }

    // Semicolons conflict
    if (key.includes('semicolon') && key.includes('omit') && detected.semicolons) {
      merged = merged.replace(/Semicolons: yes/, 'Semicolons: no (learned override)');
      conflicts++;
    } else if (key.includes('semicolon') && !key.includes('omit') && !detected.semicolons) {
      merged = merged.replace(/Semicolons: no/, 'Semicolons: yes (learned override)');
      conflicts++;
    }
  }

  return { mergedGuide: merged, conflicts };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Sample up to `max` files, preferring a mix of .liquid, .css, and .js.
 */
function sampleFiles(files: FileContext[], max: number): FileContext[] {
  if (files.length <= max) return files;

  const buckets: Record<string, FileContext[]> = {
    liquid: [],
    css: [],
    javascript: [],
    other: [],
  };

  for (const f of files) {
    const type = f.fileType ?? 'other';
    (buckets[type] ?? buckets.other).push(f);
  }

  const perBucket = Math.max(1, Math.floor(max / Object.keys(buckets).length));
  const sampled: FileContext[] = [];

  for (const bucket of Object.values(buckets)) {
    sampled.push(...bucket.slice(0, perBucket));
  }

  // Fill remaining slots from any bucket
  if (sampled.length < max) {
    for (const f of files) {
      if (sampled.length >= max) break;
      if (!sampled.includes(f)) sampled.push(f);
    }
  }

  return sampled.slice(0, max);
}
