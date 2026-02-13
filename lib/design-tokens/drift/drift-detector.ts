/**
 * REQ-52 Task 6: DriftDetector
 *
 * Monitors files for hardcoded values that have drifted from the stored
 * design token palette and generates tokenisation suggestions.
 *
 * Flow:
 *   1. Extract tokens from the file via `TokenExtractor`
 *   2. Fetch the project's stored tokens via `listByProject`
 *   3. Classify each extracted value as exact-match / near-match / hardcoded
 *   4. Generate replacement suggestions via `generateSuggestions`
 */

import { TokenExtractor } from '../token-extractor';
import { listByProject } from '../models/token-model';
import type { DesignTokenRow } from '../models/token-model';
import { parseColor } from './suggestion-generator';
import { generateSuggestions, type StoredTokenSummary } from './suggestion-generator';
import type { DriftResult, DriftItem } from './types';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Maximum RGB Euclidean distance to classify as "near match". */
const COLOR_NEAR_MATCH_THRESHOLD = 30;

/** Maximum percentage difference to classify a numeric value as "near match". */
const NUMERIC_NEAR_MATCH_RATIO = 0.15;

// ---------------------------------------------------------------------------
// DriftDetector
// ---------------------------------------------------------------------------

export class DriftDetector {
  private extractor: TokenExtractor;

  constructor(extractor?: TokenExtractor) {
    this.extractor = extractor ?? new TokenExtractor();
  }

  /**
   * Analyse a file's content against the project's stored design tokens.
   *
   * @param projectId  The project whose tokens to compare against.
   * @param fileContent  Raw file content.
   * @param filePath  Path of the file (used for parser selection).
   * @returns Drift analysis with hardcoded values, near-matches, and suggestions.
   */
  async detectDrift(
    projectId: string,
    fileContent: string,
    filePath: string,
  ): Promise<DriftResult> {
    // 1. Extract raw tokens from the file
    const extracted = this.extractor.extractFromFile(fileContent, filePath);

    // 2. Fetch stored design tokens for the project
    const storedTokens = await listByProject(projectId);

    // Build a set of normalised stored values for fast exact-match lookup
    const storedValueSet = new Set(
      storedTokens.map((t) => normalise(t.value)),
    );

    // 3. Classify extracted values
    const hardcodedValues: DriftItem[] = [];
    const nearMatches: DriftItem[] = [];

    for (const ext of extracted) {
      const normValue = normalise(ext.value);

      // Skip if it already uses a known token name (i.e. var(--name) or {{ settings.name }})
      if (ext.name && isKnownTokenName(ext.name, storedTokens)) continue;

      // Exact match → token misuse (hardcoded value exists as a token)
      if (storedValueSet.has(normValue)) {
        hardcodedValues.push({
          value: ext.value,
          lineNumber: ext.lineNumber,
          context: ext.context,
          category: ext.category,
        });
        continue;
      }

      // Near match check
      const near = findNearMatch(ext.value, ext.category, storedTokens);
      if (near) {
        nearMatches.push({
          value: ext.value,
          lineNumber: ext.lineNumber,
          context: ext.context,
          category: ext.category,
        });
        continue;
      }

      // Completely new hardcoded value
      hardcodedValues.push({
        value: ext.value,
        lineNumber: ext.lineNumber,
        context: ext.context,
        category: ext.category,
      });
    }

    // 4. Generate suggestions for all drift items
    const allDriftItems = [...hardcodedValues, ...nearMatches];
    const tokenSummaries: StoredTokenSummary[] = storedTokens.map((t) => ({
      name: t.name,
      value: t.value,
      category: t.category,
    }));
    const suggestions = generateSuggestions(allDriftItems, tokenSummaries, filePath);

    return {
      filePath,
      hardcodedValues,
      nearMatches,
      suggestions,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Check whether a token name matches any stored token. */
function isKnownTokenName(name: string, stored: DesignTokenRow[]): boolean {
  const lower = name.toLowerCase();
  return stored.some((t) => t.name.toLowerCase() === lower);
}

/** Try to find a stored token that is a "near match" for the given value. */
function findNearMatch(
  value: string,
  category: string,
  stored: DesignTokenRow[],
): DesignTokenRow | null {
  for (const token of stored) {
    if (token.category !== category) continue;

    if (category === 'color') {
      const a = parseColor(value);
      const b = parseColor(token.value);
      if (a && b) {
        const dist = Math.sqrt(
          (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
        );
        if (dist > 0 && dist <= COLOR_NEAR_MATCH_THRESHOLD) return token;
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
