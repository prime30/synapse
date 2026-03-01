/**
 * Phase 6: Theme Standardization engine.
 *
 * Audits theme files for hardcoded values and produces conform, adopt,
 * unify, and remove actions. Reuses DriftDetector and TokenExtractor.
 */

import { differenceCiede2000, parse } from 'culori';
import { listProjectFiles, getFile } from '@/lib/services/files';
import { TokenExtractor } from '../token-extractor';
import {
  listByProject,
  listUsagesByToken,
  type DesignTokenRow,
} from '../models/token-model';
import { suggestTokenName } from '../inference/naming-suggester';
import type { ExtractedToken } from '../types';
import type {
  StandardizationAudit,
  ConformAction,
  AdoptAction,
  UnifyAction,
  RemoveAction,
  AuditStats,
} from './types';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** CIEDE2000 deltaE ≤ 6: very similar color (conform with high confidence). */
const COLOR_NEAR_MATCH = 6;

/** CIEDE2000 deltaE ≤ 20: near match (conform with lower confidence). */
const COLOR_FAR_MATCH = 20;

/** CIEDE2000 deltaE < 3: same value (unify). */
const COLOR_UNIFY = 3;

/** Numeric near-match ratio (same as drift-detector). */
const NUMERIC_NEAR_MATCH_RATIO = 0.15;

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Run a full standardization audit for a project.
 *
 * 1. Load all project files and design tokens
 * 2. Extract hardcoded values from theme files
 * 3. Classify: exact/near → conform, far → adopt, similar non-tokens → unify
 * 4. Find tokens with zero usages → remove
 */
export async function standardizeTheme(
  projectId: string,
): Promise<StandardizationAudit> {
  const extractor = new TokenExtractor();

  const [files, storedTokens] = await Promise.all([
    loadProjectFiles(projectId),
    listByProject(projectId),
  ]);

  const conform: ConformAction[] = [];
  const adopt: AdoptAction[] = [];
  const unify: UnifyAction[] = [];
  let totalValuesFound = 0;

  const storedValueSet = new Set(storedTokens.map((t) => normalise(t.value)));
  const storedByNormValue = new Map(
    storedTokens.map((t) => [normalise(t.value), t]),
  );

  // Collect all extracted values (excluding those already using token names)
  const allExtracted: Array<ExtractedToken & { filePath: string }> = [];
  for (const file of files) {
    const tokens = extractor.extractFromFile(file.content, file.path);
    for (const ext of tokens) {
      if (ext.name && isKnownTokenName(ext.name, storedTokens)) continue;
      allExtracted.push({ ...ext, filePath: file.path });
      totalValuesFound++;
    }
  }

  // Count occurrences per value for adopt fileCount
  const valueToOccurrences = new Map<string, number>();
  for (const ext of allExtracted) {
    const key = normalise(ext.value);
    valueToOccurrences.set(key, (valueToOccurrences.get(key) ?? 0) + 1);
  }

  // Process each extracted value
  const processedKeys = new Set<string>();
  const unmatched: Array<{
    value: string;
    filePath: string;
    line: number;
    category: string;
    normValue: string;
  }> = [];

  for (const ext of allExtracted) {
    const normValue = normalise(ext.value);
    const key = `${ext.filePath}:${ext.lineNumber}:${normValue}`;
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);

    // Exact match → conform
    const exactToken = storedByNormValue.get(normValue);
    if (exactToken) {
      conform.push({
        id: `conform-${conform.length}`,
        filePath: ext.filePath,
        line: ext.lineNumber,
        hardcodedValue: ext.value,
        targetToken: {
          name: exactToken.name,
          value: exactToken.value,
          id: exactToken.id,
        },
        confidence: 1.0,
      });
      continue;
    }

    // Near match (colors: deltaE ≤ 20, numeric: ratio ≤ 0.15) → conform
    const nearToken = findNearMatch(ext.value, ext.category, storedTokens);
    if (nearToken) {
      const confidence = computeNearConfidence(
        ext.value,
        nearToken.value,
        ext.category,
      );
      conform.push({
        id: `conform-${conform.length}`,
        filePath: ext.filePath,
        line: ext.lineNumber,
        hardcodedValue: ext.value,
        targetToken: {
          name: nearToken.name,
          value: nearToken.value,
          id: nearToken.id,
        },
        confidence,
      });
      continue;
    }

    // No match → collect for unify (group similar) or adopt (single)
    unmatched.push({
      value: ext.value,
      filePath: ext.filePath,
      line: ext.lineNumber,
      category: ext.category,
      normValue,
    });
  }

  // Build unify groups: similar unmatched values (deltaE < 3 for colors)
  const { unifyGroups, adoptItems } = partitionUnmatched(unmatched);
  for (const group of unifyGroups) {
    unify.push({
      id: `unify-${unify.length}`,
      values: group.values,
      canonicalValue: group.canonicalValue,
      suggestedName: group.suggestedName,
    });
  }
  for (const item of adoptItems) {
    const existingNames = storedTokens.map((t) => t.name);
    const suggestion = suggestTokenName(
      {
        id: `ext-${item.filePath}-${item.line}`,
        name: null,
        category: item.category as import('../types').TokenCategory,
        value: item.value,
        filePath: item.filePath,
        lineNumber: item.line,
        context: '',
      },
      existingNames,
    );
    const fileCount = valueToOccurrences.get(item.normValue) ?? 1;
    adopt.push({
      id: `adopt-${adopt.length}`,
      filePath: item.filePath,
      line: item.line,
      hardcodedValue: item.value,
      suggestedName: suggestion.name,
      suggestedCategory: item.category,
      fileCount,
    });
  }

  // Tokens with zero usages → remove
  const remove: RemoveAction[] = [];
  for (const token of storedTokens) {
    const usages = await listUsagesByToken(token.id);
    if (usages.length === 0) {
      remove.push({
        id: `remove-${remove.length}`,
        tokenName: token.name,
        tokenValue: token.value,
        tokenId: token.id,
      });
    }
  }

  const stats: AuditStats = {
    totalFilesScanned: files.length,
    totalValuesFound,
    conformCount: conform.length,
    adoptCount: adopt.length,
    unifyCount: unify.length,
    removeCount: remove.length,
  };

  return { conform, adopt, unify, remove, stats };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadProjectFiles(
  projectId: string,
): Promise<Array<{ id: string; path: string; content: string }>> {
  const files = await listProjectFiles(projectId);
  const result: Array<{ id: string; path: string; content: string }> = [];

  const CHUNK = 20;
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const loaded = await Promise.all(
      chunk.map(async (f) => {
        try {
          const full = await getFile(f.id as string);
          const content = full?.content;
          const path = (f.path ?? f.name) as string;
          if (typeof content === 'string' && content.length > 0) {
            return { id: f.id as string, path, content };
          }
        } catch {
          /* skip */
        }
        return null;
      }),
    );
    for (const r of loaded) {
      if (r) result.push(r);
    }
  }

  return result;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isKnownTokenName(name: string, stored: DesignTokenRow[]): boolean {
  const lower = name.toLowerCase();
  return stored.some((t) => t.name.toLowerCase() === lower);
}

function findNearMatch(
  value: string,
  category: string,
  stored: DesignTokenRow[],
): DesignTokenRow | null {
  const deltaE = differenceCiede2000();
  for (const token of stored) {
    if (token.category !== category) continue;

    if (category === 'color') {
      const a = parse(value);
      const b = parse(token.value);
      if (a && b) {
        const d = deltaE(a, b);
        if (d !== undefined && d > 0 && d <= COLOR_FAR_MATCH) return token;
      }
    } else if (
      category === 'spacing' ||
      category === 'border' ||
      category === 'typography'
    ) {
      const numA = parseNumericValue(value);
      const numB = parseNumericValue(token.value);
      if (numA !== null && numB !== null && numA !== numB) {
        const diff = Math.abs(numA - numB);
        const maxVal = Math.max(Math.abs(numA), Math.abs(numB), 1);
        if (diff / maxVal <= NUMERIC_NEAR_MATCH_RATIO) return token;
      }
    }
  }
  return null;
}

function parseNumericValue(raw: string): number | null {
  const match = raw.trim().match(/^(-?[\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function computeNearConfidence(
  hardcoded: string,
  tokenValue: string,
  category: string,
): number {
  if (category === 'color') {
    const deltaE = differenceCiede2000();
    const a = parse(hardcoded);
    const b = parse(tokenValue);
    if (!a || !b) return 0.6;
    const d = deltaE(a, b);
    if (d === undefined) return 0.6;
    if (d <= COLOR_NEAR_MATCH) return 0.9;
    if (d <= COLOR_FAR_MATCH) return 0.6 + (0.3 * (COLOR_FAR_MATCH - d)) / COLOR_FAR_MATCH;
    return 0.6;
  }
  const numA = parseNumericValue(hardcoded);
  const numB = parseNumericValue(tokenValue);
  if (numA === null || numB === null) return 0.6;
  if (numA === numB) return 1.0;
  const diff = Math.abs(numA - numB);
  const maxVal = Math.max(Math.abs(numA), Math.abs(numB), 1);
  const ratio = diff / maxVal;
  if (ratio <= 0.05) return 0.85;
  if (ratio <= 0.15) return 0.6;
  return 0.5;
}

function isFarFromAllTokens(value: string, stored: DesignTokenRow[]): boolean {
  const colorTokens = stored.filter((t) => t.category === 'color');
  if (colorTokens.length === 0) return true;
  const deltaE = differenceCiede2000();
  const a = parse(value);
  if (!a) return true;
  for (const t of colorTokens) {
    const b = parse(t.value);
    if (b) {
      const d = deltaE(a, b);
      if (d !== undefined && d <= COLOR_FAR_MATCH) return false;
    }
  }
  return true;
}

interface UnifyGroup {
  values: { value: string; filePath: string; line: number }[];
  canonicalValue: string;
  suggestedName: string;
}

type UnmatchedItem = {
  value: string;
  filePath: string;
  line: number;
  category: string;
  normValue: string;
};

function partitionUnmatched(
  unmatched: UnmatchedItem[],
): { unifyGroups: UnifyGroup[]; adoptItems: UnmatchedItem[] } {
  const deltaE = differenceCiede2000();
  const unifyGroups: UnifyGroup[] = [];
  const adoptItems: UnmatchedItem[] = [];
  const used = new Set<number>();

  // For colors: group by deltaE < 3
  const colorItems = unmatched.filter((u) => u.category === 'color');
  for (let i = 0; i < colorItems.length; i++) {
    if (used.has(i)) continue;
    const group: { value: string; filePath: string; line: number }[] = [
      {
        value: colorItems[i].value,
        filePath: colorItems[i].filePath,
        line: colorItems[i].line,
      },
    ];
    used.add(i);

    for (let j = i + 1; j < colorItems.length; j++) {
      if (used.has(j)) continue;
      const a = parse(colorItems[i].value);
      const b = parse(colorItems[j].value);
      if (a && b) {
        const d = deltaE(a, b);
        if (d !== undefined && d < COLOR_UNIFY) {
          group.push({
            value: colorItems[j].value,
            filePath: colorItems[j].filePath,
            line: colorItems[j].line,
          });
          used.add(j);
        }
      }
    }

    if (group.length >= 2) {
      unifyGroups.push({
        values: group,
        canonicalValue: group[0].value,
        suggestedName: `color-unified-${unifyGroups.length}`,
      });
    } else {
      adoptItems.push(colorItems[i]);
    }
  }

  // Adopt: add non-color unmatched
  for (const u of unmatched) {
    if (u.category !== 'color') adoptItems.push(u);
  }

  return { unifyGroups, adoptItems };
}
