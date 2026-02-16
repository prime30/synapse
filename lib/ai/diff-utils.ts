/**
 * Diff utilities for computing scroll targets from code edits.
 * Uses the diff package (already a project dependency) to find
 * the first changed line range between original and new content.
 */

import { diffLines } from 'diff';

export interface ChangedLineRange {
  /** 1-based start line in the NEW content. */
  startLine: number;
  /** 1-based end line in the NEW content (inclusive). */
  endLine: number;
}

/**
 * Compute the first changed line range between original and new content.
 * Returns the 1-based line range in the *new* content where the first
 * diff hunk starts, or null if the contents are identical or diff fails.
 */
export function getFirstChangedLineRange(
  originalContent: string,
  newContent: string,
): ChangedLineRange | null {
  if (originalContent === newContent) return null;

  try {
    const changes = diffLines(originalContent, newContent);
    let lineInNew = 1;

    for (const change of changes) {
      const lineCount = (change.value.match(/\n/g) || []).length;
      const hasContent = change.value.length > 0;
      const effectiveLines = lineCount + (hasContent && !change.value.endsWith('\n') ? 1 : 0);

      if (change.added) {
        return {
          startLine: lineInNew,
          endLine: lineInNew + Math.max(effectiveLines - 1, 0),
        };
      }

      if (change.removed) {
        return {
          startLine: Math.max(lineInNew, 1),
          endLine: Math.max(lineInNew, 1),
        };
      }

      lineInNew += effectiveLines;
    }

    return null;
  } catch {
    return null;
  }
}
