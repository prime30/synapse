/**
 * Region extractor: locate a named code region (function, CSS selector,
 * Liquid block, schema setting) in file content and return the exact lines.
 *
 * Agents should call extract_region BEFORE search_replace on any file they
 * haven't already fully read — it gives them the precise surrounding context
 * needed for a successful patch, eliminating "failed to find context" errors.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type MatchType = 'exact' | 'block-boundary' | 'fuzzy' | 'none';

export interface RegionMatch {
  startLine: number;
  endLine: number;
  /** Line-numbered snippet (e.g. "  42: .hero { ... }") */
  snippet: string;
  matchType: MatchType;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Common block-opener patterns that should trigger boundary expansion. */
const BLOCK_OPENER_RE =
  /^(\s*)(export\s+)?(async\s+)?function\s+|^(\s*)(export\s+)?(default\s+)?class\s+|^\s*[\w$-]+\s*[({]|^\s*\{%[-\s]*(block|schema|for|if|unless|case|form|capture|tablerow)\b/i;

/** Matching Liquid end-tag for a given opener keyword. */
function liquidEndTag(opener: string): RegExp {
  const kw = opener.replace(/^\{%-?\s*/, '').split(/\s/)[0];
  return new RegExp(`\\{%-?\\s*end${kw}\\b`);
}

/**
 * Expand a seed line upward/downward to include the full enclosing block.
 * Handles: JS/TS braces `{ }`, Liquid `{% tag %}...{% endtag %}`.
 */
function expandToBlockBoundary(
  lines: string[],
  seedLine: number,
  maxExpand = 120,
): { start: number; end: number } {
  const text = lines[seedLine];

  // ── Liquid block expansion ──────────────────────────────────────────
  const liquidOpener = text.match(/\{%-?\s*(\w+)/);
  if (liquidOpener) {
    const endRe = liquidEndTag(text);
    let depth = 0;
    let end = seedLine;
    for (let i = seedLine; i < Math.min(lines.length, seedLine + maxExpand); i++) {
      if (/\{%-?\s*(?:block|schema|for|if|unless|case|form|capture|tablerow)\b/i.test(lines[i])) depth++;
      if (endRe.test(lines[i])) {
        depth--;
        if (depth <= 0) { end = i; break; }
      }
    }
    // Walk backward to find the opener if seed is not the opener line
    let start = seedLine;
    const openerRe = new RegExp(`\\{%-?\\s*${liquidOpener[1]}\\b`);
    for (let i = seedLine; i >= Math.max(0, seedLine - maxExpand); i--) {
      if (openerRe.test(lines[i])) { start = i; break; }
    }
    return { start, end };
  }

  // ── Brace-based block expansion (JS/TS/CSS) ─────────────────────────
  if (text.includes('{')) {
    let depth = 0;
    let end = seedLine;
    for (let i = seedLine; i < Math.min(lines.length, seedLine + maxExpand); i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0 && i > seedLine) { end = i; break; }
    }
    // Walk backward to find opener
    let start = seedLine;
    for (let i = seedLine; i >= Math.max(0, seedLine - maxExpand); i--) {
      if (BLOCK_OPENER_RE.test(lines[i])) { start = i; break; }
    }
    return { start, end };
  }

  return { start: seedLine, end: seedLine };
}

/** Build a line-numbered snippet string. */
function makeSnippet(lines: string[], start: number, end: number): string {
  return lines
    .slice(start, end + 1)
    .map((l, i) => `${String(start + i + 1).padStart(5)}: ${l}`)
    .join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Locate a named region in `content` and return its exact line range + snippet.
 *
 * Strategy (in order):
 *  1. Exact substring match on a single line → expand to block boundary
 *  2. Regex match for common declaration patterns (function/class/selector)
 *  3. Fuzzy token-overlap scoring → best-scoring line ± contextLines
 *  4. No match → matchType 'none'
 *
 * @param content     Full file content string
 * @param hint        The symbol/selector/block to find (e.g. "addToCart", ".hero", "{% schema %}")
 * @param contextLines Lines of context around fuzzy matches (default 4)
 */
export function extractTargetRegion(
  content: string,
  hint: string,
  contextLines = 4,
): RegionMatch {
  const lines = content.split('\n');
  const hintLower = hint.toLowerCase().trim();

  // ── 1. Exact substring match ───────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(hintLower)) {
      const isBlockOpener = BLOCK_OPENER_RE.test(lines[i]) || lines[i].includes('{') || /\{%-?\s*\w+/.test(lines[i]);
      if (isBlockOpener) {
        const { start, end } = expandToBlockBoundary(lines, i);
        return {
          startLine: start + 1,
          endLine: end + 1,
          snippet: makeSnippet(lines, start, end),
          matchType: 'block-boundary',
        };
      }
      // Non-block line — return with context
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      return {
        startLine: start + 1,
        endLine: end + 1,
        snippet: makeSnippet(lines, start, end),
        matchType: 'exact',
      };
    }
  }

  // ── 2. Regex declaration match ────────────────────────────────────
  // Try "function hint", "class hint", ".hint {", "#hint {", "hint:" etc.
  const escaped = hintLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declRe = new RegExp(
    `(?:function|class|const|let|var|def)\\s+${escaped}|[.#]${escaped}\\s*\\{|${escaped}\\s*[:({]`,
    'i',
  );
  for (let i = 0; i < lines.length; i++) {
    if (declRe.test(lines[i])) {
      const { start, end } = expandToBlockBoundary(lines, i);
      return {
        startLine: start + 1,
        endLine: end + 1,
        snippet: makeSnippet(lines, start, end),
        matchType: 'block-boundary',
      };
    }
  }

  // ── 3. Fuzzy token-overlap fallback ──────────────────────────────
  const tokens = hintLower.split(/\W+/).filter(t => t.length > 1);
  if (tokens.length > 0) {
    let bestLine = -1;
    let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (lower.includes(tok)) score++;
      }
      if (score > bestScore) { bestScore = score; bestLine = i; }
    }
    if (bestLine >= 0 && bestScore > 0) {
      const start = Math.max(0, bestLine - contextLines);
      const end = Math.min(lines.length - 1, bestLine + contextLines);
      return {
        startLine: start + 1,
        endLine: end + 1,
        snippet: makeSnippet(lines, start, end),
        matchType: 'fuzzy',
      };
    }
  }

  return { startLine: 0, endLine: 0, snippet: '', matchType: 'none' };
}
