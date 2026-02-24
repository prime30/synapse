/**
 * Theme Gap Detector – scans theme files against the CX pattern library.
 * Identifies which CX patterns are present, missing, or partially implemented.
 */

import { CX_PATTERNS, type CXPattern } from './cx-patterns';

export interface ThemeGapResult {
  present: CXPattern[];
  missing: CXPattern[];
  partial: CXPattern[];
}

/**
 * Detects which CX patterns are present, missing, or partially implemented
 * in the given theme file contents.
 *
 * @param fileContents - Map of file path -> file content (e.g. from theme sync)
 * @returns ThemeGapResult with present, missing, and partial patterns
 */
export async function detectThemeGaps(
  fileContents: Map<string, string>
): Promise<ThemeGapResult> {
  const present: CXPattern[] = [];
  const missing: CXPattern[] = [];
  const partial: CXPattern[] = [];

  for (const pattern of CX_PATTERNS) {
    const relevantPaths = getRelevantPaths(pattern, fileContents);
    if (relevantPaths.length === 0) {
      // No related files exist in the theme – treat as missing
      missing.push(pattern);
      continue;
    }

    const matchingPaths: string[] = [];
    let regex: RegExp;
    try {
      regex = new RegExp(pattern.detectionPattern, 'i');
    } catch {
      // Invalid regex – treat as missing
      missing.push(pattern);
      continue;
    }

    for (const path of relevantPaths) {
      const content = fileContents.get(path);
      if (content && regex.test(content)) {
        matchingPaths.push(path);
      }
    }

    if (matchingPaths.length === relevantPaths.length) {
      present.push(pattern);
    } else if (matchingPaths.length > 0) {
      partial.push(pattern);
    } else {
      missing.push(pattern);
    }
  }

  return { present, missing, partial };
}

/**
 * Resolves pattern.relatedFiles to paths that exist in fileContents.
 * Handles both exact paths and path patterns (e.g. sections/main-*.liquid).
 */
function getRelevantPaths(pattern: CXPattern, fileContents: Map<string, string>): string[] {
  const paths: string[] = [];
  const keys = Array.from(fileContents.keys());

  for (const rel of pattern.relatedFiles) {
    if (rel.includes('*')) {
      const regex = pathPatternToRegex(rel);
      paths.push(...keys.filter((k) => regex.test(k)));
    } else {
      const exact = keys.find((k) => k === rel || k.endsWith(rel) || k.includes(rel));
      if (exact) paths.push(exact);
      else if (fileContents.has(rel)) paths.push(rel);
    }
  }

  return [...new Set(paths)];
}

function pathPatternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
