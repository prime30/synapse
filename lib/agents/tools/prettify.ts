/**
 * Lightweight code formatter for Shopify theme files.
 * Normalizes indentation and whitespace without changing semantics.
 *
 * Not a full Prettier — just enough to eliminate whitespace mismatches
 * between what the agent reads and what it writes.
 */

const INDENT_SIZE = 2;
const INDENT = ' '.repeat(INDENT_SIZE);

// ── Liquid formatting ───────────────────────────────────────────────────────

const LIQUID_INDENT_OPEN = /^\s*\{%-?\s*(if|unless|for|case|capture|form|paginate|tablerow|comment|style|schema|javascript|stylesheet)\b/;
const LIQUID_INDENT_CLOSE = /^\s*\{%-?\s*(endif|endunless|endfor|endcase|endcapture|endform|endpaginate|endtablerow|endcomment|endstyle|endschema|endjavascript|endstylesheet)\b/;
const LIQUID_MIDPOINT = /^\s*\{%-?\s*(else|elsif|when)\b/;
const HTML_OPEN = /^\s*<(?!\/|!|br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)(\w+)/;
const HTML_CLOSE = /^\s*<\/\w+/;

export function prettifyLiquid(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let depth = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    if (LIQUID_INDENT_CLOSE.test(trimmed) || HTML_CLOSE.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }
    if (LIQUID_MIDPOINT.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }

    result.push(INDENT.repeat(depth) + trimmed);

    if (LIQUID_MIDPOINT.test(trimmed)) {
      depth++;
    }
    if (LIQUID_INDENT_OPEN.test(trimmed) || (HTML_OPEN.test(trimmed) && !trimmed.endsWith('/>'))) {
      depth++;
    }
  }

  return result.join('\n');
}

// ── CSS formatting ──────────────────────────────────────────────────────────

export function prettifyCSS(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let depth = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    if (trimmed.startsWith('}')) {
      depth = Math.max(0, depth - 1);
    }

    result.push(INDENT.repeat(depth) + trimmed);

    if (trimmed.endsWith('{') && !trimmed.includes('}')) {
      depth++;
    }
  }

  return result.join('\n');
}

// ── JS formatting ───────────────────────────────────────────────────────────

export function prettifyJS(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let depth = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    const closers = (trimmed.match(/^[}\])]/) ?? []).length;
    if (closers > 0) {
      depth = Math.max(0, depth - 1);
    }

    result.push(INDENT.repeat(depth) + trimmed);

    const openers = (trimmed.match(/[{[(]\s*$/) ?? []).length;
    if (openers > 0) {
      depth++;
    }
  }

  return result.join('\n');
}

// ── Whitespace normalization (safe for all file types) ──────────────────────

/**
 * Normalize whitespace without changing indentation structure.
 * - Converts tabs to spaces
 * - Removes trailing whitespace per line
 * - Normalizes CRLF to LF
 * - Removes trailing blank lines
 */
export function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, INDENT)
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Prettify a theme file based on its extension.
 * Returns the formatted content, or the original if formatting fails.
 *
 * IMPORTANT: Only normalizes whitespace (tabs→spaces, trailing whitespace,
 * CRLF→LF). Does NOT re-indent. The naive re-indenting formatters
 * (prettifyLiquid, prettifyCSS, prettifyJS) destroyed indentation in
 * real-world files with mixed HTML/Liquid/JS/CSS, so they are disabled.
 */
export function prettifyFile(content: string, filePath: string): string {
  try {
    void filePath;
    return normalizeWhitespace(content);
  } catch {
    return content;
  }
}

/**
 * Normalize content the agent reads — lighter than full prettify.
 * Just tabs→spaces, trailing whitespace, CRLF→LF.
 */
export function normalizeForAgent(content: string): string {
  return normalizeWhitespace(content);
}
