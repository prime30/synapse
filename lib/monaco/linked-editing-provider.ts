/**
 * Monaco LinkedEditingRangeProvider for HTML tag auto-rename.
 * When editing <div> the matching </div> auto-updates.
 */

import type { editor, Position, IRange, CancellationToken } from 'monaco-editor';

export function createLinkedEditingProvider(
  monaco: typeof import('monaco-editor')
): import('monaco-editor').languages.LinkedEditingRangeProvider {
  return {
    provideLinkedEditingRanges(
      model: editor.ITextModel,
      position: Position,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by LinkedEditingRangeProvider interface
      _token: CancellationToken
    ): import('monaco-editor').languages.ProviderResult<import('monaco-editor').languages.LinkedEditingRanges> {
      const content = model.getValue();
      const offset = model.getOffsetAt(position);
      const lineNumber = position.lineNumber;

      const lineContent = model.getLineContent(lineNumber);
      const lineStart = model.getOffsetAt({ lineNumber, column: 1 });
      const posInLine = offset - lineStart;

      // Check if cursor is on an HTML tag name
      const result = findTagAtPosition(lineContent, posInLine);
      if (!result) return null;

      const { tagName, isClosing, start, end } = result;

      // Self-closing tags: <br />, <img />, etc. - skip them
      const openAngle = lineContent.lastIndexOf('<', start);
      const beforeTag = lineContent.slice(openAngle, start);
      if (/\/\s*$/.test(beforeTag)) return null;

      const globalStart = lineStart + start;
      const globalEnd = lineStart + end;

      const matchingRange = findMatchingTag(
        content,
        tagName,
        globalStart,
        globalEnd,
        isClosing
      );
      if (!matchingRange) return null;

      const ranges: IRange[] = [];

      const range1 = model.getPositionAt(globalStart);
      const range1End = model.getPositionAt(globalEnd);
      if (range1 && range1End) {
        ranges.push(
          new monaco.Range(range1.lineNumber, range1.column, range1End.lineNumber, range1End.column)
        );
      }

      const range2 = model.getPositionAt(matchingRange.start);
      const range2End = model.getPositionAt(matchingRange.end);
      if (range2 && range2End) {
        ranges.push(
          new monaco.Range(range2.lineNumber, range2.column, range2End.lineNumber, range2End.column)
        );
      }

      return {
        ranges,
        wordPattern: /[a-zA-Z][a-zA-Z0-9-]*/,
      };
    },
  };
}

interface TagAtPosition {
  tagName: string;
  isClosing: boolean;
  start: number;
  end: number;
}

function findTagAtPosition(
  lineContent: string,
  posInLine: number
): TagAtPosition | null {
  // Find < or </ before cursor, then capture tag name
  const re = /<(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)/g;
  let m: RegExpExecArray | null;
  let best: TagAtPosition | null = null;

  while ((m = re.exec(lineContent)) !== null) {
    const isClosing = m[1] === '/';
    const tagName = m[2];
    const tagStart = m.index + m[0].length - tagName.length;
    const tagEnd = m.index + m[0].length;

    if (posInLine >= tagStart && posInLine <= tagEnd) {
      best = { tagName, isClosing, start: tagStart, end: tagEnd };
      break;
    }
  }

  return best;
}

interface OffsetRange {
  start: number;
  end: number;
}

function findMatchingTag(
  content: string,
  tagName: string,
  posStart: number,
  posEnd: number,
  fromClosing: boolean
): OffsetRange | null {
  const lowerTag = tagName.toLowerCase();

  // Self-closing tags - no matching close
  const SELF_CLOSING = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  if (SELF_CLOSING.has(lowerTag)) return null;

  if (fromClosing) {
    return findMatchingOpenTag(content, tagName, posStart);
  }
  return findMatchingCloseTag(content, tagName, posEnd);
}

function findMatchingOpenTag(
  content: string,
  tagName: string,
  closeTagOffset: number
): OffsetRange | null {
  const lowerTag = tagName.toLowerCase();
  const openRe = new RegExp(`<\\s*${escapeRe(lowerTag)}(?=[\\s>])`, 'gi');
  const closeRe = new RegExp(`</\\s*${escapeRe(lowerTag)}\\s*>`, 'gi');

  const closes: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;

  closeRe.lastIndex = 0;
  while ((m = closeRe.exec(content)) !== null) {
    closes.push({ start: m.index, end: m.index + m[0].length });
  }

  const opens: { start: number; end: number; tagMatch: string }[] = [];
  openRe.lastIndex = 0;
  while ((m = openRe.exec(content)) !== null) {
    const tagMatch = m[0].match(/<(\s*)([a-zA-Z][a-zA-Z0-9-]*)/i)?.[2] ?? '';
    const tagStart = m.index + m[0].length - tagMatch.length;
    opens.push({ start: tagStart, end: m.index + m[0].length, tagMatch });
  }

  let depth = 1;
  for (const c of closes) {
    if (c.start >= closeTagOffset) break;
    if (c.start < closeTagOffset) depth++;
  }

  for (let i = opens.length - 1; i >= 0; i--) {
    const o = opens[i];
    if (o.end > closeTagOffset) continue;
    if (o.tagMatch.toLowerCase() === lowerTag) {
      depth--;
      if (depth === 0) {
        return { start: o.start, end: o.end };
      }
    }
  }

  return null;
}

function findMatchingCloseTag(
  content: string,
  tagName: string,
  openTagEnd: number
): OffsetRange | null {
  const lowerTag = tagName.toLowerCase();
  const openRe = new RegExp(`<\\s*${escapeRe(lowerTag)}(?=[\\s>])`, 'gi');
  const closeRe = new RegExp(`</\\s*${escapeRe(lowerTag)}\\s*>`, 'gi');

  let depth = 1;
  openRe.lastIndex = openTagEnd;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(content)) !== null) {
    const tagMatch = m[0].match(/<(\s*)([a-zA-Z][a-zA-Z0-9-]*)/i)?.[2] ?? '';
    if (tagMatch.toLowerCase() === lowerTag) depth++;
  }

  closeRe.lastIndex = openTagEnd;
  while ((m = closeRe.exec(content)) !== null) {
    const tagMatch = m[0].match(/<\/(\s*)([a-zA-Z][a-zA-Z0-9-]*)/i)?.[2] ?? '';
    if (tagMatch.toLowerCase() === lowerTag) {
      depth--;
      if (depth === 0) {
        const tagStart = m.index + m[0].indexOf(tagMatch);
        return { start: tagStart, end: tagStart + tagMatch.length };
      }
    }
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
