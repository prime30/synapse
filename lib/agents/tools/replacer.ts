/**
 * Multi-tier search_replace matching cascade.
 *
 * Ported from OpenCode (sst/opencode) with Synapse-specific adjustments:
 *   - BlockAnchorReplacer placed late in cascade (known false-positive issues)
 *   - EscapeNormalizedReplacer applies unescape to both find AND content
 *   - Added error messages that guide toward edit_lines fallback
 *
 * Each Replacer is a generator that yields candidate strings found in `content`
 * that semantically match `find`. The `replace()` function tries replacers in
 * order, accepting the first unique match.
 *
 * Cascade order:
 *   1. Simple (exact)
 *   2. LineTrimmed (trim each line)
 *   3. WhitespaceNormalized (collapse all whitespace)
 *   4. IndentationFlexible (remove common indent)
 *   5. EscapeNormalized (unescape \\n, \\t, etc.)
 *   6. TrimmedBoundary (trim whole block)
 *   7. ContextAware (anchor first/last lines, fuzzy middle)
 *   8. BlockAnchor (levenshtein similarity on middle lines)
 *   9. MultiOccurrence (yields all exact matches for replaceAll)
 */

export type Replacer = (content: string, find: string) => Generator<string>;

// ── 1. SimpleReplacer ────────────────────────────────────────────────────────

export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

// ── 2. LineTrimmedReplacer ───────────────────────────────────────────────────

export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n');
  const searchLines = find.split('\n');

  if (searchLines[searchLines.length - 1] === '') {
    searchLines.pop();
  }

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }

    if (matches) {
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length;
        if (k < searchLines.length - 1) matchEndIndex += 1;
      }
      yield content.substring(matchStartIndex, matchEndIndex);
    }
  }
};

// ── 3. WhitespaceNormalizedReplacer ──────────────────────────────────────────

function normalizeWS(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizedFind = normalizeWS(find);
  const lines = content.split('\n');

  // Single-line matches
  for (const line of lines) {
    if (normalizeWS(line) === normalizedFind) {
      yield line;
    } else {
      const normalizedLine = normalizeWS(line);
      if (normalizedLine.includes(normalizedFind)) {
        const words = find.trim().split(/\s+/);
        if (words.length > 0) {
          const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
          try {
            const regex = new RegExp(pattern);
            const match = line.match(regex);
            if (match) yield match[0];
          } catch { /* invalid regex, skip */ }
        }
      }
    }
  }

  // Multi-line matches
  const findLines = find.split('\n');
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalizeWS(block.join('\n')) === normalizedFind) {
        yield block.join('\n');
      }
    }
  }
};

// ── 4. IndentationFlexibleReplacer ───────────────────────────────────────────

function removeIndentation(text: string): string {
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return text;

  const minIndent = Math.min(
    ...nonEmptyLines.map(line => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    }),
  );

  return lines
    .map(line => (line.trim().length === 0 ? line : line.slice(minIndent)))
    .join('\n');
}

export const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const normalizedFind = removeIndentation(find);
  const contentLines = content.split('\n');
  const findLines = find.split('\n');

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join('\n');
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};

// ── 5. EscapeNormalizedReplacer ──────────────────────────────────────────────

function unescapeString(str: string): string {
  return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (_match, ch: string) => {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case "'": return "'";
      case '"': return '"';
      case '`': return '`';
      case '\\': return '\\';
      case '\n': return '\n';
      case '$': return '$';
      default: return _match;
    }
  });
}

export const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapedFind = unescapeString(find);

  if (content.includes(unescapedFind)) {
    yield unescapedFind;
  }

  const lines = content.split('\n');
  const findLines = unescapedFind.split('\n');

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join('\n');
    if (unescapeString(block) === unescapedFind) {
      yield block;
    }
  }
};

// ── 6. TrimmedBoundaryReplacer ───────────────────────────────────────────────

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (trimmedFind === find) return;

  if (content.includes(trimmedFind)) {
    yield trimmedFind;
  }

  const lines = content.split('\n');
  const findLines = find.split('\n');

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join('\n');
    if (block.trim() === trimmedFind) {
      yield block;
    }
  }
};

// ── 7. ContextAwareReplacer ──────────────────────────────────────────────────

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split('\n');
  if (findLines.length < 3) return;

  if (findLines[findLines.length - 1] === '') findLines.pop();

  const contentLines = content.split('\n');
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        const blockLines = contentLines.slice(i, j + 1);

        if (blockLines.length === findLines.length) {
          let matchingLines = 0;
          let totalNonEmptyLines = 0;

          for (let k = 1; k < blockLines.length - 1; k++) {
            const bLine = blockLines[k].trim();
            const fLine = findLines[k].trim();
            if (bLine.length > 0 || fLine.length > 0) {
              totalNonEmptyLines++;
              if (bLine === fLine) matchingLines++;
            }
          }

          if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
            yield blockLines.join('\n');
            break;
          }
        }
        break;
      }
    }
  }
};

// ── 8. BlockAnchorReplacer ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === '' || b === '') return Math.max(a.length, b.length);
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

const SINGLE_CANDIDATE_SIMILARITY = 0.6;
const MULTI_CANDIDATE_SIMILARITY = 0.5;

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n');
  const searchLines = find.split('\n');
  if (searchLines.length < 3) return;

  if (searchLines[searchLines.length - 1] === '') searchLines.pop();

  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;

  const candidates: Array<{ startLine: number; endLine: number }> = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue;
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j });
        break;
      }
    }
  }

  if (candidates.length === 0) return;

  let bestMatch: { startLine: number; endLine: number } | null = null;
  let maxSimilarity = -1;
  const threshold = candidates.length === 1 ? SINGLE_CANDIDATE_SIMILARITY : MULTI_CANDIDATE_SIMILARITY;

  for (const { startLine, endLine } of candidates) {
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);

    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const origLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(origLine.length, searchLine.length);
        if (maxLen === 0) continue;
        similarity += (1 - levenshtein(origLine, searchLine) / maxLen) / linesToCheck;
      }
    } else {
      similarity = 1.0;
    }

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = { startLine, endLine };
    }
  }

  if (maxSimilarity >= threshold && bestMatch) {
    const { startLine, endLine } = bestMatch;
    let matchStartIndex = 0;
    for (let k = 0; k < startLine; k++) {
      matchStartIndex += originalLines[k].length + 1;
    }
    let matchEndIndex = matchStartIndex;
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length;
      if (k < endLine) matchEndIndex += 1;
    }
    yield content.substring(matchStartIndex, matchEndIndex);
  }
};

// ── 9. MultiOccurrenceReplacer ───────────────────────────────────────────────

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0;
  while (true) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};

// ── Main replace function ────────────────────────────────────────────────────

const REPLACERS: Replacer[] = [
  SimpleReplacer,
  LineTrimmedReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  BlockAnchorReplacer,
  MultiOccurrenceReplacer,
];

export interface ReplaceResult {
  content: string;
  replacerUsed: string;
  matchCount: number;
}

/**
 * Find and replace `oldString` in `content` using the 9-tier matching cascade.
 *
 * Tries each replacer in order. For each replacer:
 *   - Gets all candidate match strings from the generator
 *   - Finds each candidate in content via indexOf
 *   - If replaceAll: replaces all occurrences and returns immediately
 *   - If unique (single occurrence): replaces and returns
 *   - If ambiguous (multiple occurrences): tries the next replacer
 *
 * Throws descriptive errors guiding toward edit_lines fallback.
 */
export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): ReplaceResult {
  if (oldString === newString) {
    throw new Error('No changes to apply: oldString and newString are identical.');
  }

  let notFound = true;
  const replacerNames = [
    'Simple', 'LineTrimmed', 'WhitespaceNormalized', 'IndentationFlexible',
    'EscapeNormalized', 'TrimmedBoundary', 'ContextAware', 'BlockAnchor', 'MultiOccurrence',
  ];

  for (let r = 0; r < REPLACERS.length; r++) {
    const replacer = REPLACERS[r];
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;
      notFound = false;

      if (replaceAll) {
        const matchCount = content.split(search).length - 1;
        return {
          content: content.replaceAll(search, newString),
          replacerUsed: replacerNames[r],
          matchCount,
        };
      }

      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue;

      return {
        content: content.substring(0, index) + newString + content.substring(index + search.length),
        replacerUsed: replacerNames[r],
        matchCount: 1,
      };
    }
  }

  if (notFound) {
    throw new Error(
      'old_text not found in the file. Use read_lines to see exact content, then edit_lines with line numbers.',
    );
  }
  throw new Error(
    'old_text matches multiple locations. Add more surrounding context lines or use nearLine for precision.',
  );
}
