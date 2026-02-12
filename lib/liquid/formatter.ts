/**
 * Rule-based Liquid formatter.
 * Formats Liquid templates with proper indentation and whitespace normalization.
 * Does NOT use Prettier; implements formatting rules directly.
 */

export interface FormatOptions {
  /** Number of spaces per indent level. Default: 2 */
  tabSize?: number;
  /** Whether to ensure a final newline. Default: true */
  insertFinalNewline?: boolean;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  tabSize: 2,
  insertFinalNewline: true,
};

/** Liquid tags that open a block (increase indent for body) */
const OPENING_TAGS = new Set([
  'if',
  'for',
  'unless',
  'case',
  'capture',
  'form',
  'paginate',
  'tablerow',
]);

/** Liquid tags that close a block (decrease indent before line) */
const CLOSING_TAGS = new Set([
  'endif',
  'endfor',
  'endunless',
  'endcase',
  'endcapture',
  'endform',
  'endpaginate',
  'endtablerow',
]);

/** Mid-block tags: same level as opening tag (dedent then-indent) */
const MID_BLOCK_TAGS = new Set(['elsif', 'else', 'when']);

/** Regex for Liquid tag: {% or {%- followed by tag name */
const TAG_REGEX = /\{%-?\s*(\w+)/g;

/**
 * Normalize whitespace inside {{ }} delimiters.
 * {{  product.title  }} -> {{ product.title }}
 * Preserves {{- and -}} whitespace-trim markers.
 */
function normalizeOutput(line: string): string {
  return line.replace(/\{\{-?\s*([\s\S]*?)\s*-?\}\}/g, (match, inner) => {
    const open = match.startsWith('{{-') ? '{{-' : '{{';
    const close = match.endsWith('-}}') ? '-}}' : '}}';
    const trimmed = inner.trim();
    return trimmed ? `${open} ${trimmed} ${close}` : `${open} ${close}`;
  });
}

/**
 * Normalize whitespace inside {% %} delimiters.
 * {%   if   condition   %} -> {% if condition %}
 * Preserves {%- and -%} whitespace-trim markers.
 */
function normalizeTag(line: string): string {
  return line.replace(/\{%-?\s*([\s\S]*?)\s*-?%\}/g, (match, inner) => {
    const open = match.startsWith('{%-') ? '{%-' : '{%';
    const close = match.endsWith('-%}') ? '-%}' : '%}';
    const trimmed = inner.trim().replace(/\s+/g, ' ');
    return `${open} ${trimmed} ${close}`;
  });
}

/**
 * Normalize whitespace in a line (both {{ }} and {% %}).
 * Skip if inside raw/comment block.
 */
function normalizeWhitespace(line: string): string {
  let result = line;
  result = normalizeOutput(result);
  result = normalizeTag(result);
  return result;
}

/**
 * Parse tag names from a line.
 */
function getTagsOnLine(line: string): string[] {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;
  while ((m = TAG_REGEX.exec(line)) !== null) {
    tags.push(m[1].toLowerCase());
  }
  return tags;
}

/**
 * Get the first tag name from a tag string like "{% if x %}".
 */
function getTagName(tag: string): string {
  const m = tag.match(/\{%-?\s*(\w+)/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Check if a tag is a block tag (opening, closing, or mid-block).
 */
function isBlockTag(tagName: string): boolean {
  return (
    OPENING_TAGS.has(tagName) ||
    CLOSING_TAGS.has(tagName) ||
    MID_BLOCK_TAGS.has(tagName)
  );
}

/**
 * Check if content looks like HTML (starts with < or is a tag).
 */
function looksLikeHtml(content: string): boolean {
  const t = content.trim();
  return t.startsWith('<') || t.endsWith('>');
}

/**
 * Expand a line into multiple logical lines when it contains multiple block tags.
 * E.g. "{% if x %}y{% endif %}" -> ["{% if x %}", "y", "{% endif %}"]
 * Preserves HTML structure: "<div>{% if x %}" and "{% endif %}</div>" stay together.
 */
function expandLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [trimmed];

  const parts: string[] = [];
  let lastIndex = 0;

  // Match both {% %} tags and {{ }} outputs
  const combinedRegex = /\{\{-?[\s\S]*?-?\}\}|\{\{[\s\S]*?\}\}|\{%-?[\s\S]*?-?%\}|\{%[\s\S]*?%\}/g;
  let m: RegExpExecArray | null;

  while ((m = combinedRegex.exec(trimmed)) !== null) {
    const contentBefore = trimmed.slice(lastIndex, m.index).trim();
    if (contentBefore) {
      parts.push(contentBefore);
    }
    parts.push(m[0]);
    lastIndex = m.index + m[0].length;
  }

  const contentAfter = trimmed.slice(lastIndex).trim();
  if (contentAfter) {
    parts.push(contentAfter);
  }

  // If we have only one part or no block tags, return as single line
  const blockTagIndices: number[] = [];
  parts.forEach((p, i) => {
    if (p.startsWith('{%')) {
      const name = getTagName(p);
      if (isBlockTag(name)) blockTagIndices.push(i);
    }
  });

  if (blockTagIndices.length < 2) {
    return [trimmed];
  }

  // Merge leading HTML with first tag and trailing HTML with last tag
  const result: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];
    // Skip leading HTML that will be merged with first block tag
    if (
      !part.startsWith('{%') &&
      i < parts.length - 1 &&
      parts[i + 1].startsWith('{%') &&
      blockTagIndices[0] === i + 1 &&
      looksLikeHtml(part)
    ) {
      i++;
      continue;
    }
    if (part.startsWith('{%')) {
      const isFirstBlock = blockTagIndices[0] === i;
      const isLastBlock = blockTagIndices[blockTagIndices.length - 1] === i;

      if (isFirstBlock && i > 0 && looksLikeHtml(parts[i - 1])) {
        result.push((parts[i - 1] + part).trim());
        i += 1;
        continue;
      }
      if (isLastBlock && i < parts.length - 1 && looksLikeHtml(parts[i + 1])) {
        result.push((part + parts[i + 1]).trim());
        i += 2;
        continue;
      }
      result.push(part.trim());
      i++;
    } else {
      if (part.trim()) result.push(part.trim());
      i++;
    }
  }
  return result.length > 1 ? result : [trimmed];
}

/**
 * Check if line opens a raw or comment block.
 */
function isRawOrCommentOpen(line: string): boolean {
  const tags = getTagsOnLine(line);
  return tags.some((t) => t === 'raw' || t === 'comment');
}

/**
 * Check if line closes a raw or comment block.
 */
function isRawOrCommentClose(line: string): boolean {
  const tags = getTagsOnLine(line);
  return tags.some((t) => t === 'endraw' || t === 'endcomment');
}

/**
 * Check if line contains schema block start.
 */
function isSchemaOpen(line: string): boolean {
  return getTagsOnLine(line).includes('schema');
}

/**
 * Check if line contains schema block end.
 */
function isSchemaClose(line: string): boolean {
  return getTagsOnLine(line).includes('endschema');
}

/**
 * Format JSON string with 2-space indent.
 * Returns original string if parsing fails.
 */
function formatJson(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonStr;
  }
}

/**
 * Format Liquid template with proper indentation and whitespace.
 */
export function formatLiquid(source: string, options?: FormatOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const indentStr = ' '.repeat(opts.tabSize);

  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  let indentLevel = 0;
  let inRawOrComment = false;
  let inSchema = false;
  let schemaBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Collect schema content
    if (inSchema) {
      if (isSchemaClose(rawLine)) {
        const jsonContent = schemaBuffer.join('\n');
        const formatted = formatJson(jsonContent);
        output.push(indentStr.repeat(indentLevel) + formatted);
        output.push(indentStr.repeat(indentLevel) + rawLine.trim());
        schemaBuffer = [];
        inSchema = false;
      } else {
        schemaBuffer.push(rawLine);
      }
      continue;
    }

    if (isSchemaOpen(rawLine)) {
      output.push(indentStr.repeat(indentLevel) + rawLine.trim());
      inSchema = true;
      continue;
    }

    // Preserve raw/comment blocks entirely
    if (inRawOrComment) {
      output.push(rawLine);
      if (isRawOrCommentClose(rawLine)) {
        inRawOrComment = false;
      }
      continue;
    }

    if (isRawOrCommentOpen(rawLine)) {
      output.push(indentStr.repeat(indentLevel) + rawLine.trim());
      inRawOrComment = true;
      continue;
    }

    const expanded = expandLine(rawLine);

    for (const segment of expanded) {
      const tags = getTagsOnLine(segment);
      const closingCount = tags.filter((t) => CLOSING_TAGS.has(t)).length;
      const midBlockCount = tags.filter((t) => MID_BLOCK_TAGS.has(t)).length;
      const openingCount = tags.filter((t) => OPENING_TAGS.has(t)).length;

      // Dedent before closing or mid-block tags
      indentLevel = Math.max(0, indentLevel - closingCount - midBlockCount);

      const trimmed = segment.trim();
      const normalized = trimmed ? normalizeWhitespace(trimmed) : trimmed;
      const lineToWrite = normalized ? indentStr.repeat(indentLevel) + normalized : normalized;

      if (lineToWrite !== '') {
        output.push(lineToWrite);
      } else if (trimmed === '' && segment === '') {
        output.push('');
      }

      // Indent after opening tags
      indentLevel += openingCount;

      // Restore indent for mid-block (content after else/elsif/when is indented)
      indentLevel += midBlockCount;
    }
  }

  let result = output.join('\n');
  if (opts.insertFinalNewline && result.length > 0 && !result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}
