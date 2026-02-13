// ─────────────────────────────────────────────────────────────────────────────
// Liquid AST Parser
// Full recursive-descent parser producing typed AST nodes with source locations.
// Supports all standard Liquid constructs + Shopify-specific tags.
// ─────────────────────────────────────────────────────────────────────────────

// ── Source Location ──────────────────────────────────────────────────────────

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
  length: number;
}

// ── Expressions ──────────────────────────────────────────────────────────────

export type Expression =
  | VariableLookup
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | NilLiteral
  | RangeExpression
  | BinaryExpression;

export interface VariableLookup {
  type: 'VariableLookup';
  name: string;
  lookups: (string | Expression)[];
  loc: SourceLocation;
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
  quote: '\'' | '"';
  loc: SourceLocation;
}

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  loc: SourceLocation;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
  loc: SourceLocation;
}

export interface NilLiteral {
  type: 'NilLiteral';
  loc: SourceLocation;
}

export interface RangeExpression {
  type: 'Range';
  start: Expression;
  end: Expression;
  loc: SourceLocation;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
  loc: SourceLocation;
}

// ── Filter Application ───────────────────────────────────────────────────────

export interface FilterApplication {
  name: string;
  args: Expression[];
  loc: SourceLocation;
}

// ── AST Nodes ────────────────────────────────────────────────────────────────

export type LiquidASTNode =
  | TextNode
  | OutputNode
  | AssignNode
  | IfNode
  | UnlessNode
  | ForNode
  | CaseNode
  | CaptureNode
  | RawNode
  | CommentNode
  | RenderNode
  | IncludeNode
  | SectionTagNode
  | SchemaNode
  | FormNode
  | PaginateNode
  | TableRowNode
  | LayoutNode
  | StyleNode
  | JavaScriptNode
  | StylesheetNode
  | IncrementNode
  | DecrementNode
  | BreakNode
  | ContinueNode
  | LiquidTagNode;

export interface TextNode {
  type: 'Text';
  value: string;
  loc: SourceLocation;
}

export interface OutputNode {
  type: 'Output';
  expression: Expression;
  filters: FilterApplication[];
  trimLeft: boolean;
  trimRight: boolean;
  loc: SourceLocation;
}

export interface AssignNode {
  type: 'Assign';
  name: string;
  value: Expression;
  filters: FilterApplication[];
  loc: SourceLocation;
}

export interface IfBranch {
  condition: Expression | null;
  body: LiquidASTNode[];
  loc: SourceLocation;
}

export interface IfNode {
  type: 'If';
  branches: IfBranch[];
  loc: SourceLocation;
}

export interface UnlessNode {
  type: 'Unless';
  condition: Expression;
  consequent: LiquidASTNode[];
  alternate: LiquidASTNode[];
  loc: SourceLocation;
}

export interface ForNode {
  type: 'For';
  variable: string;
  collection: Expression;
  body: LiquidASTNode[];
  elseBody: LiquidASTNode[];
  limit: Expression | null;
  offset: Expression | null;
  reversed: boolean;
  loc: SourceLocation;
}

export interface CaseNode {
  type: 'Case';
  expression: Expression;
  whens: WhenBranch[];
  elseBody: LiquidASTNode[];
  loc: SourceLocation;
}

export interface WhenBranch {
  values: Expression[];
  body: LiquidASTNode[];
  loc: SourceLocation;
}

export interface CaptureNode {
  type: 'Capture';
  name: string;
  body: LiquidASTNode[];
  loc: SourceLocation;
}

export interface RawNode {
  type: 'Raw';
  value: string;
  loc: SourceLocation;
}

export interface CommentNode {
  type: 'Comment';
  value: string;
  loc: SourceLocation;
}

export interface RenderNode {
  type: 'Render';
  snippetName: string;
  variable: Expression | null;
  alias: string | null;
  isFor: boolean;
  args: { name: string; value: Expression }[];
  loc: SourceLocation;
}

export interface IncludeNode {
  type: 'Include';
  snippetName: string;
  variable: Expression | null;
  args: { name: string; value: Expression }[];
  loc: SourceLocation;
}

export interface SectionTagNode {
  type: 'SectionTag';
  name: string;
  loc: SourceLocation;
}

export interface SchemaNode {
  type: 'Schema';
  jsonContent: string;
  parsedJSON: unknown | null;
  loc: SourceLocation;
}

export interface FormNode {
  type: 'Form';
  formType: Expression;
  args: Expression[];
  body: LiquidASTNode[];
  loc: SourceLocation;
}

export interface PaginateNode {
  type: 'Paginate';
  collection: Expression;
  pageSize: Expression;
  body: LiquidASTNode[];
  loc: SourceLocation;
}

export interface TableRowNode {
  type: 'TableRow';
  variable: string;
  collection: Expression;
  body: LiquidASTNode[];
  limit: Expression | null;
  offset: Expression | null;
  cols: Expression | null;
  loc: SourceLocation;
}

export interface LayoutNode {
  type: 'Layout';
  name: Expression;
  loc: SourceLocation;
}

export interface StyleNode {
  type: 'Style';
  value: string;
  loc: SourceLocation;
}

export interface JavaScriptNode {
  type: 'JavaScript';
  value: string;
  loc: SourceLocation;
}

export interface StylesheetNode {
  type: 'Stylesheet';
  value: string;
  loc: SourceLocation;
}

export interface IncrementNode {
  type: 'Increment';
  name: string;
  loc: SourceLocation;
}

export interface DecrementNode {
  type: 'Decrement';
  name: string;
  loc: SourceLocation;
}

export interface BreakNode {
  type: 'Break';
  loc: SourceLocation;
}

export interface ContinueNode {
  type: 'Continue';
  loc: SourceLocation;
}

export interface LiquidTagNode {
  type: 'LiquidTag';
  name: string;
  markup: string;
  loc: SourceLocation;
}

// ── Parse Error & Result ─────────────────────────────────────────────────────

export interface ParseError {
  message: string;
  loc: SourceLocation;
}

export interface ParseResult {
  ast: LiquidASTNode[];
  errors: ParseError[];
}

// ── Internal: Template Segment ───────────────────────────────────────────────

interface Segment {
  kind: 'text' | 'output' | 'tag';
  raw: string;
  content: string;
  offset: number;
  contentOffset: number;
  trimLeft: boolean;
  trimRight: boolean;
}

// ── Internal: Expression Token ───────────────────────────────────────────────

const enum TT {
  Identifier,
  StringLiteral,
  NumberLiteral,
  Pipe,
  Colon,
  Comma,
  Dot,
  DotDot,
  Assign,
  OpenBracket,
  CloseBracket,
  OpenParen,
  CloseParen,
  CompareOp,
  EOF,
}

interface ExprToken {
  tt: TT;
  value: string;
  offset: number;
  length: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function offsetToLoc(source: string, offset: number, length: number): SourceLocation {
  let line = 1;
  let lastNewline = -1;
  const clampedOffset = Math.min(offset, source.length);
  for (let i = 0; i < clampedOffset; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: clampedOffset - lastNewline, offset, length };
}

function isAlpha(ch: number): boolean {
  return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 95;
}

function isDigit(ch: number): boolean {
  return ch >= 48 && ch <= 57;
}

function isAlphaNum(ch: number): boolean {
  return isAlpha(ch) || isDigit(ch);
}

// ── Template Scanner ─────────────────────────────────────────────────────────
// Splits the template into text / output / tag segments.
// Handles raw-content blocks (raw, comment, schema, style, javascript, stylesheet)
// by scanning past their content without interpreting Liquid delimiters inside.

/** Tags whose body content should not be parsed as Liquid. */
const RAW_CONTENT_TAGS = new Set([
  'raw', 'comment', 'schema', 'style', 'javascript', 'stylesheet',
]);

function skipStringInDelimiter(template: string, pos: number): number {
  const quote = template.charCodeAt(pos);
  let i = pos + 1;
  while (i < template.length) {
    if (template.charCodeAt(i) === quote) return i + 1;
    i++;
  }
  return i;
}

function findClosingDelimiter(
  template: string,
  start: number,
  close: string,
): number {
  let pos = start;
  const c0 = close.charCodeAt(0);
  const c1 = close.charCodeAt(1);
  while (pos < template.length - 1) {
    const ch = template.charCodeAt(pos);
    if (ch === 39 || ch === 34) {
      pos = skipStringInDelimiter(template, pos);
      continue;
    }
    if (ch === c0 && template.charCodeAt(pos + 1) === c1) return pos;
    pos++;
  }
  return -1;
}

function scanTemplate(template: string): Segment[] {
  const segments: Segment[] = [];
  let pos = 0;

  while (pos < template.length) {
    // Find the next Liquid delimiter
    let nextOutput = template.indexOf('{{', pos);
    let nextTag = template.indexOf('{%', pos);

    // Avoid false positive: {{- vs {%- where they start at the same position
    if (nextOutput === -1) nextOutput = Infinity;
    if (nextTag === -1) nextTag = Infinity;

    if (nextOutput === Infinity && nextTag === Infinity) {
      // Rest is text
      if (pos < template.length) {
        const text = template.slice(pos);
        segments.push({
          kind: 'text',
          raw: text,
          content: text,
          offset: pos,
          contentOffset: pos,
          trimLeft: false,
          trimRight: false,
        });
      }
      break;
    }

    const nextDelim = Math.min(nextOutput, nextTag);
    const isOutput = nextDelim === nextOutput;

    // Text before this delimiter
    if (nextDelim > pos) {
      const text = template.slice(pos, nextDelim);
      segments.push({
        kind: 'text',
        raw: text,
        content: text,
        offset: pos,
        contentOffset: pos,
        trimLeft: false,
        trimRight: false,
      });
    }

    if (isOutput) {
      // ── Output block {{ ... }} ──
      const trimLeft = template.charCodeAt(nextDelim + 2) === 45; // '-'
      const contentStart = nextDelim + (trimLeft ? 3 : 2);
      const closeIdx = findClosingDelimiter(template, contentStart, '}}');

      if (closeIdx === -1) {
        // Unclosed output – treat rest as text
        segments.push({
          kind: 'text',
          raw: template.slice(nextDelim),
          content: template.slice(nextDelim),
          offset: nextDelim,
          contentOffset: nextDelim,
          trimLeft: false,
          trimRight: false,
        });
        break;
      }

      const trimRight = closeIdx > contentStart && template.charCodeAt(closeIdx - 1) === 45;
      const contentEnd = trimRight ? closeIdx - 1 : closeIdx;
      const endIdx = closeIdx + 2;

      segments.push({
        kind: 'output',
        raw: template.slice(nextDelim, endIdx),
        content: template.slice(contentStart, contentEnd).trim(),
        offset: nextDelim,
        contentOffset: contentStart,
        trimLeft,
        trimRight,
      });

      pos = endIdx;
    } else {
      // ── Tag block {% ... %} ──
      const trimLeft = template.charCodeAt(nextDelim + 2) === 45;
      const contentStart = nextDelim + (trimLeft ? 3 : 2);
      const closeIdx = findClosingDelimiter(template, contentStart, '%}');

      if (closeIdx === -1) {
        segments.push({
          kind: 'text',
          raw: template.slice(nextDelim),
          content: template.slice(nextDelim),
          offset: nextDelim,
          contentOffset: nextDelim,
          trimLeft: false,
          trimRight: false,
        });
        break;
      }

      const trimRight = closeIdx > contentStart && template.charCodeAt(closeIdx - 1) === 45;
      const contentEnd = trimRight ? closeIdx - 1 : closeIdx;
      const endIdx = closeIdx + 2;
      const content = template.slice(contentStart, contentEnd).trim();

      segments.push({
        kind: 'tag',
        raw: template.slice(nextDelim, endIdx),
        content,
        offset: nextDelim,
        contentOffset: contentStart,
        trimLeft,
        trimRight,
      });

      // If this is a raw-content tag, grab everything until the closing tag
      const tagName = content.split(/\s/)[0];
      if (RAW_CONTENT_TAGS.has(tagName) && !content.startsWith('end')) {
        const endTagName = `end${tagName}`;
        const endPattern = new RegExp(`\\{%-?\\s*${endTagName}\\s*-?%\\}`, 'g');
        endPattern.lastIndex = endIdx;
        const endMatch = endPattern.exec(template);

        if (endMatch) {
          const rawContent = template.slice(endIdx, endMatch.index);
          segments.push({
            kind: 'text',
            raw: rawContent,
            content: rawContent,
            offset: endIdx,
            contentOffset: endIdx,
            trimLeft: false,
            trimRight: false,
          });

          const endTrimLeft = endMatch[0].indexOf('{%-') === 0;
          const endTrimRight = endMatch[0].indexOf('-%}') >= 0;
          segments.push({
            kind: 'tag',
            raw: endMatch[0],
            content: endTagName,
            offset: endMatch.index,
            contentOffset: endMatch.index + (endTrimLeft ? 3 : 2),
            trimLeft: endTrimLeft,
            trimRight: endTrimRight,
          });

          pos = endMatch.index + endMatch[0].length;
        } else {
          // Unclosed raw block – rest is text
          if (endIdx < template.length) {
            segments.push({
              kind: 'text',
              raw: template.slice(endIdx),
              content: template.slice(endIdx),
              offset: endIdx,
              contentOffset: endIdx,
              trimLeft: false,
              trimRight: false,
            });
          }
          pos = template.length;
        }
      } else {
        pos = endIdx;
      }
    }
  }

  return segments;
}

// ── Expression Lexer ─────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TT> = {
  and: TT.CompareOp,
  or: TT.CompareOp,
  contains: TT.CompareOp,
};

function tokenizeExpression(content: string, baseOffset: number): ExprToken[] {
  const tokens: ExprToken[] = [];
  let pos = 0;

  while (pos < content.length) {
    // Skip whitespace
    const ch = content.charCodeAt(pos);
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
      pos++;
      continue;
    }

    const start = pos;

    // String literal
    if (ch === 39 || ch === 34) {
      const quote = ch;
      pos++;
      while (pos < content.length && content.charCodeAt(pos) !== quote) {
        pos++;
      }
      if (pos < content.length) pos++; // closing quote
      tokens.push({
        tt: TT.StringLiteral,
        value: content.slice(start, pos),
        offset: baseOffset + start,
        length: pos - start,
      });
      continue;
    }

    // Number literal
    if (isDigit(ch)) {
      while (pos < content.length && isDigit(content.charCodeAt(pos))) pos++;
      if (
        pos < content.length &&
        content.charCodeAt(pos) === 46 &&
        pos + 1 < content.length &&
        isDigit(content.charCodeAt(pos + 1))
      ) {
        pos++; // skip dot
        while (pos < content.length && isDigit(content.charCodeAt(pos))) pos++;
      }
      tokens.push({
        tt: TT.NumberLiteral,
        value: content.slice(start, pos),
        offset: baseOffset + start,
        length: pos - start,
      });
      continue;
    }

    // Identifier / keyword
    if (isAlpha(ch)) {
      while (pos < content.length && isAlphaNum(content.charCodeAt(pos))) pos++;
      // Allow hyphens mid-identifier (e.g., content-for-header) only if
      // the character after the hyphen is alpha (to avoid confusion with minus).
      while (
        pos < content.length &&
        content.charCodeAt(pos) === 45 &&
        pos + 1 < content.length &&
        isAlpha(content.charCodeAt(pos + 1))
      ) {
        pos++; // skip hyphen
        while (pos < content.length && isAlphaNum(content.charCodeAt(pos))) pos++;
      }
      const word = content.slice(start, pos);
      const kwTT = KEYWORDS[word];
      tokens.push({
        tt: kwTT ?? TT.Identifier,
        value: word,
        offset: baseOffset + start,
        length: pos - start,
      });
      continue;
    }

    // Two-character operators
    if (pos + 1 < content.length) {
      const two = content.slice(pos, pos + 2);
      if (two === '==' || two === '!=' || two === '<>' || two === '<=' || two === '>=') {
        tokens.push({ tt: TT.CompareOp, value: two, offset: baseOffset + start, length: 2 });
        pos += 2;
        continue;
      }
      if (two === '..') {
        tokens.push({ tt: TT.DotDot, value: '..', offset: baseOffset + start, length: 2 });
        pos += 2;
        continue;
      }
    }

    // Single-character operators
    switch (ch) {
      case 124: // |
        tokens.push({ tt: TT.Pipe, value: '|', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 58: // :
        tokens.push({ tt: TT.Colon, value: ':', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 44: // ,
        tokens.push({ tt: TT.Comma, value: ',', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 46: // .
        tokens.push({ tt: TT.Dot, value: '.', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 61: // =
        tokens.push({ tt: TT.Assign, value: '=', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 91: // [
        tokens.push({ tt: TT.OpenBracket, value: '[', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 93: // ]
        tokens.push({ tt: TT.CloseBracket, value: ']', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 40: // (
        tokens.push({ tt: TT.OpenParen, value: '(', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 41: // )
        tokens.push({ tt: TT.CloseParen, value: ')', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 60: // <
        tokens.push({ tt: TT.CompareOp, value: '<', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      case 62: // >
        tokens.push({ tt: TT.CompareOp, value: '>', offset: baseOffset + start, length: 1 });
        pos++;
        continue;
      default:
        // Unknown character – skip it
        pos++;
        continue;
    }
  }

  tokens.push({
    tt: TT.EOF,
    value: '',
    offset: baseOffset + pos,
    length: 0,
  });

  return tokens;
}

// ── Expression Parser ────────────────────────────────────────────────────────

class ExprParser {
  private tokens: ExprToken[];
  private pos: number;
  private source: string;

  constructor(tokens: ExprToken[], source: string) {
    this.tokens = tokens;
    this.pos = 0;
    this.source = source;
  }

  peek(): ExprToken {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  advance(): ExprToken {
    const token = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return token;
  }

  expect(tt: TT): ExprToken {
    const token = this.peek();
    if (token.tt !== tt) {
      throw new Error(`Expected token type ${tt}, got ${token.tt} ("${token.value}")`);
    }
    return this.advance();
  }

  match(tt: TT): boolean {
    if (this.peek().tt === tt) {
      this.advance();
      return true;
    }
    return false;
  }

  matchId(name: string): boolean {
    const t = this.peek();
    if (t.tt === TT.Identifier && t.value === name) {
      this.advance();
      return true;
    }
    return false;
  }

  atEnd(): boolean {
    return this.peek().tt === TT.EOF;
  }

  loc(offset: number, length: number): SourceLocation {
    return offsetToLoc(this.source, offset, length);
  }

  // ── Condition parsing (left-to-right, no precedence among and/or) ──

  parseCondition(): Expression {
    let left = this.parseComparison();
    while (!this.atEnd() && this.peek().tt === TT.CompareOp &&
           (this.peek().value === 'and' || this.peek().value === 'or')) {
      const opToken = this.advance();
      const right = this.parseComparison();
      left = {
        type: 'BinaryExpression',
        operator: opToken.value,
        left,
        right,
        loc: this.loc(left.loc.offset, right.loc.offset + right.loc.length - left.loc.offset),
      };
    }
    return left;
  }

  parseComparison(): Expression {
    const left = this.parsePrimary();
    if (
      !this.atEnd() &&
      this.peek().tt === TT.CompareOp &&
      this.peek().value !== 'and' &&
      this.peek().value !== 'or'
    ) {
      const opToken = this.advance();
      const right = this.parsePrimary();
      return {
        type: 'BinaryExpression',
        operator: opToken.value,
        left,
        right,
        loc: this.loc(left.loc.offset, right.loc.offset + right.loc.length - left.loc.offset),
      };
    }
    return left;
  }

  parsePrimary(): Expression {
    const token = this.peek();

    // Range: (start..end)
    if (token.tt === TT.OpenParen) {
      const startOffset = token.offset;
      this.advance();
      const start = this.parsePrimary();
      this.expect(TT.DotDot);
      const end = this.parsePrimary();
      const closeParen = this.expect(TT.CloseParen);
      return {
        type: 'Range',
        start,
        end,
        loc: this.loc(startOffset, closeParen.offset + closeParen.length - startOffset),
      };
    }

    // String literal
    if (token.tt === TT.StringLiteral) {
      this.advance();
      const raw = token.value;
      const quote = raw[0] as '\'' | '"';
      return {
        type: 'StringLiteral',
        value: raw.slice(1, -1),
        quote,
        loc: this.loc(token.offset, token.length),
      };
    }

    // Number literal
    if (token.tt === TT.NumberLiteral) {
      this.advance();
      return {
        type: 'NumberLiteral',
        value: parseFloat(token.value),
        loc: this.loc(token.offset, token.length),
      };
    }

    // Identifier (possibly a keyword like true/false/nil/null/blank/empty)
    if (token.tt === TT.Identifier) {
      if (token.value === 'true' || token.value === 'false') {
        this.advance();
        return {
          type: 'BooleanLiteral',
          value: token.value === 'true',
          loc: this.loc(token.offset, token.length),
        };
      }
      if (
        token.value === 'nil' ||
        token.value === 'null' ||
        token.value === 'blank' ||
        token.value === 'empty'
      ) {
        this.advance();
        return {
          type: 'NilLiteral',
          loc: this.loc(token.offset, token.length),
        };
      }
      return this.parseVariable();
    }

    // Fallback: produce a nil literal for error recovery
    this.advance();
    return {
      type: 'NilLiteral',
      loc: this.loc(token.offset, token.length || 1),
    };
  }

  parseVariable(): VariableLookup {
    const nameToken = this.expect(TT.Identifier);
    const lookups: (string | Expression)[] = [];

    while (!this.atEnd()) {
      if (this.peek().tt === TT.Dot) {
        this.advance();
        if (this.peek().tt === TT.Identifier) {
          const propToken = this.advance();
          lookups.push(propToken.value);
        } else if (this.peek().tt === TT.NumberLiteral) {
          // e.g., product.images.0
          const numToken = this.advance();
          lookups.push(numToken.value);
        } else {
          break;
        }
      } else if (this.peek().tt === TT.OpenBracket) {
        this.advance();
        const index = this.parseCondition();
        this.match(TT.CloseBracket);
        lookups.push(index);
      } else {
        break;
      }
    }

    const endOffset = lookups.length > 0
      ? this.tokens[this.pos - 1].offset + this.tokens[this.pos - 1].length
      : nameToken.offset + nameToken.length;

    return {
      type: 'VariableLookup',
      name: nameToken.value,
      lookups,
      loc: this.loc(nameToken.offset, endOffset - nameToken.offset),
    };
  }

  // ── Filter chain ──

  parseFilterChain(): FilterApplication[] {
    const filters: FilterApplication[] = [];
    while (!this.atEnd() && this.peek().tt === TT.Pipe) {
      this.advance(); // consume |
      if (this.peek().tt !== TT.Identifier) break;
      const nameToken = this.advance();
      const args: Expression[] = [];

      if (!this.atEnd() && this.peek().tt === TT.Colon) {
        this.advance(); // consume :
        args.push(this.parseCondition());
        while (!this.atEnd() && this.peek().tt === TT.Comma) {
          this.advance(); // consume ,
          args.push(this.parseCondition());
        }
      }

      const endOffset = args.length > 0
        ? args[args.length - 1].loc.offset + args[args.length - 1].loc.length
        : nameToken.offset + nameToken.length;

      filters.push({
        name: nameToken.value,
        args,
        loc: this.loc(nameToken.offset, endOffset - nameToken.offset),
      });
    }
    return filters;
  }

  // ── Output content: expression | filter1 | filter2: arg ──

  parseOutput(): { expression: Expression; filters: FilterApplication[] } {
    const expression = this.parseCondition();
    const filters = this.parseFilterChain();
    return { expression, filters };
  }
}

// ── Main Parser ──────────────────────────────────────────────────────────────

class LiquidParser {
  private segments: Segment[];
  private pos: number;
  private source: string;
  private errors: ParseError[];

  constructor(segments: Segment[], source: string) {
    this.segments = segments;
    this.pos = 0;
    this.source = source;
    this.errors = [];
  }

  private peekSegment(): Segment | null {
    return this.pos < this.segments.length ? this.segments[this.pos] : null;
  }

  private advanceSegment(): Segment {
    return this.segments[this.pos++];
  }

  private getTagName(content: string): string {
    return content.split(/\s/)[0] ?? '';
  }

  private getTagMarkup(content: string): string {
    const idx = content.indexOf(' ');
    return idx >= 0 ? content.slice(idx + 1).trim() : '';
  }

  private makeExprParser(content: string, baseOffset: number): ExprParser {
    const tokens = tokenizeExpression(content, baseOffset);
    return new ExprParser(tokens, this.source);
  }

  private addError(message: string, offset: number, length: number): void {
    this.errors.push({
      message,
      loc: offsetToLoc(this.source, offset, length),
    });
  }

  // ── Main parse entry ──

  parse(): ParseResult {
    const ast = this.parseBody(null);
    return { ast, errors: this.errors };
  }

  // ── Parse body until hitting a closing/branching tag ──

  /**
   * Parse segments into AST nodes until we hit a tag whose name is in `endTags`
   * (or EOF). Returns the collected nodes. Does NOT consume the end tag.
   */
  private parseBody(endTags: Set<string> | null): LiquidASTNode[] {
    const nodes: LiquidASTNode[] = [];

    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;

      if (seg.kind === 'text') {
        this.advanceSegment();
        if (seg.content.length > 0) {
          nodes.push({
            type: 'Text',
            value: seg.content,
            loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
          });
        }
        continue;
      }

      if (seg.kind === 'output') {
        this.advanceSegment();
        nodes.push(this.parseOutput(seg));
        continue;
      }

      // It's a tag
      const tagName = this.getTagName(seg.content);

      // Check if this is an end tag we should stop at
      if (endTags && endTags.has(tagName)) {
        return nodes; // Don't consume – caller will handle it
      }

      this.advanceSegment();
      const node = this.parseTag(seg, tagName);
      if (node) nodes.push(node);
    }

    return nodes;
  }

  // ── Parse output {{ ... }} ──

  private parseOutput(seg: Segment): OutputNode {
    try {
      const ep = this.makeExprParser(seg.content, seg.contentOffset);
      const { expression, filters } = ep.parseOutput();
      return {
        type: 'Output',
        expression,
        filters,
        trimLeft: seg.trimLeft,
        trimRight: seg.trimRight,
        loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
      };
    } catch {
      this.addError(`Failed to parse output expression: ${seg.content}`, seg.offset, seg.raw.length);
      return {
        type: 'Output',
        expression: { type: 'NilLiteral', loc: offsetToLoc(this.source, seg.contentOffset, 0) },
        filters: [],
        trimLeft: seg.trimLeft,
        trimRight: seg.trimRight,
        loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
      };
    }
  }

  // ── Parse tag {% ... %} ──

  private parseTag(seg: Segment, tagName: string): LiquidASTNode | null {
    const tagLoc = offsetToLoc(this.source, seg.offset, seg.raw.length);

    try {
      switch (tagName) {
        case 'if': return this.parseIf(seg);
        case 'unless': return this.parseUnless(seg);
        case 'for': return this.parseFor(seg);
        case 'tablerow': return this.parseTableRow(seg);
        case 'case': return this.parseCase(seg);
        case 'capture': return this.parseCapture(seg);
        case 'raw': return this.parseRaw(seg);
        case 'comment': return this.parseComment(seg);
        case 'schema': return this.parseSchema(seg);
        case 'style': return this.parseStyleBlock(seg);
        case 'javascript': return this.parseJavaScriptBlock(seg);
        case 'stylesheet': return this.parseStylesheetBlock(seg);
        case 'form': return this.parseForm(seg);
        case 'paginate': return this.parsePaginate(seg);
        case 'assign': return this.parseAssign(seg);
        case 'render': return this.parseRender(seg);
        case 'include': return this.parseInclude(seg);
        case 'section': return this.parseSectionTag(seg);
        case 'layout': return this.parseLayout(seg);
        case 'increment': return this.parseIncrement(seg);
        case 'decrement': return this.parseDecrement(seg);
        case 'break': return { type: 'Break', loc: tagLoc };
        case 'continue': return { type: 'Continue', loc: tagLoc };

        // Closing/intermediate tags encountered out of context
        case 'endif':
        case 'endunless':
        case 'endfor':
        case 'endtablerow':
        case 'endcase':
        case 'endcapture':
        case 'endraw':
        case 'endcomment':
        case 'endschema':
        case 'endstyle':
        case 'endjavascript':
        case 'endstylesheet':
        case 'endform':
        case 'endpaginate':
        case 'elsif':
        case 'else':
        case 'when':
          this.addError(`Unexpected tag "{% ${tagName} %}" without matching opening tag`, seg.offset, seg.raw.length);
          return null;

        default:
          return {
            type: 'LiquidTag',
            name: tagName,
            markup: this.getTagMarkup(seg.content),
            loc: tagLoc,
          };
      }
    } catch (err) {
      this.addError(
        `Error parsing {% ${tagName} %}: ${err instanceof Error ? err.message : 'unknown error'}`,
        seg.offset,
        seg.raw.length,
      );
      return {
        type: 'LiquidTag',
        name: tagName,
        markup: this.getTagMarkup(seg.content),
        loc: tagLoc,
      };
    }
  }

  // ── Tag parsers ────────────────────────────────────────────────────────────

  private parseIf(openSeg: Segment): IfNode {
    const branches: IfBranch[] = [];
    const startOffset = openSeg.offset;

    // First branch (the if)
    const condMarkup = this.getTagMarkup(openSeg.content);
    const condEp = this.makeExprParser(condMarkup, openSeg.contentOffset + openSeg.content.indexOf(condMarkup));
    const condition = condEp.parseCondition();
    const body = this.parseBody(new Set(['elsif', 'else', 'endif']));
    branches.push({
      condition,
      body,
      loc: offsetToLoc(this.source, openSeg.offset, openSeg.raw.length),
    });

    // Additional branches
    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind !== 'tag') break;
      const name = this.getTagName(seg.content);

      if (name === 'elsif') {
        this.advanceSegment();
        const elsifMarkup = this.getTagMarkup(seg.content);
        const elsifEp = this.makeExprParser(elsifMarkup, seg.contentOffset + seg.content.indexOf(elsifMarkup));
        const elsifCond = elsifEp.parseCondition();
        const elsifBody = this.parseBody(new Set(['elsif', 'else', 'endif']));
        branches.push({
          condition: elsifCond,
          body: elsifBody,
          loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
        });
      } else if (name === 'else') {
        this.advanceSegment();
        const elseBody = this.parseBody(new Set(['endif']));
        branches.push({
          condition: null,
          body: elseBody,
          loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
        });
      } else if (name === 'endif') {
        this.advanceSegment();
        break;
      } else {
        this.addError('Expected {% elsif %}, {% else %}, or {% endif %}', seg.offset, seg.raw.length);
        break;
      }
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'If',
      branches,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseUnless(openSeg: Segment): UnlessNode {
    const startOffset = openSeg.offset;
    const condMarkup = this.getTagMarkup(openSeg.content);
    const condEp = this.makeExprParser(condMarkup, openSeg.contentOffset + openSeg.content.indexOf(condMarkup));
    const condition = condEp.parseCondition();

    const consequent = this.parseBody(new Set(['else', 'endunless']));
    let alternate: LiquidASTNode[] = [];

    if (this.peekSegment()?.kind === 'tag' && this.getTagName(this.peekSegment()!.content) === 'else') {
      this.advanceSegment();
      alternate = this.parseBody(new Set(['endunless']));
    }

    this.consumeEndTag('endunless');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Unless',
      condition,
      consequent,
      alternate,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseFor(openSeg: Segment): ForNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));

    const variableToken = ep.expect(TT.Identifier);
    ep.matchId('in');
    const collection = ep.parsePrimary();

    // Parse optional params: limit, offset, reversed
    let limit: Expression | null = null;
    let offset: Expression | null = null;
    let reversed = false;

    while (!ep.atEnd()) {
      if (ep.matchId('reversed')) {
        reversed = true;
      } else if (ep.matchId('limit')) {
        ep.match(TT.Colon);
        limit = ep.parsePrimary();
      } else if (ep.matchId('offset')) {
        ep.match(TT.Colon);
        offset = ep.parsePrimary();
      } else {
        break;
      }
    }

    const body = this.parseBody(new Set(['else', 'endfor']));
    let elseBody: LiquidASTNode[] = [];

    if (this.peekSegment()?.kind === 'tag' && this.getTagName(this.peekSegment()!.content) === 'else') {
      this.advanceSegment();
      elseBody = this.parseBody(new Set(['endfor']));
    }

    this.consumeEndTag('endfor');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'For',
      variable: variableToken.value,
      collection,
      body,
      elseBody,
      limit,
      offset,
      reversed,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseTableRow(openSeg: Segment): TableRowNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));

    const variableToken = ep.expect(TT.Identifier);
    ep.matchId('in');
    const collection = ep.parsePrimary();

    let limit: Expression | null = null;
    let offset: Expression | null = null;
    let cols: Expression | null = null;

    while (!ep.atEnd()) {
      if (ep.matchId('limit')) {
        ep.match(TT.Colon);
        limit = ep.parsePrimary();
      } else if (ep.matchId('offset')) {
        ep.match(TT.Colon);
        offset = ep.parsePrimary();
      } else if (ep.matchId('cols')) {
        ep.match(TT.Colon);
        cols = ep.parsePrimary();
      } else {
        break;
      }
    }

    const body = this.parseBody(new Set(['endtablerow']));
    this.consumeEndTag('endtablerow');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'TableRow',
      variable: variableToken.value,
      collection,
      body,
      limit,
      offset,
      cols,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseCase(openSeg: Segment): CaseNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));
    const expression = ep.parseCondition();

    const whens: WhenBranch[] = [];
    let elseBody: LiquidASTNode[] = [];

    // Skip any text/whitespace before first when
    this.skipTextSegments();

    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind !== 'tag') {
        // Skip text between when blocks
        this.advanceSegment();
        continue;
      }
      const name = this.getTagName(seg.content);

      if (name === 'when') {
        this.advanceSegment();
        const whenMarkup = this.getTagMarkup(seg.content);
        const whenEp = this.makeExprParser(whenMarkup, seg.contentOffset + seg.content.indexOf(whenMarkup));

        const values: Expression[] = [];
        values.push(whenEp.parsePrimary());
        while (!whenEp.atEnd() && (whenEp.peek().tt === TT.Comma || whenEp.matchId('or'))) {
          if (whenEp.peek().tt === TT.Comma) whenEp.advance();
          values.push(whenEp.parsePrimary());
        }

        const whenBody = this.parseBody(new Set(['when', 'else', 'endcase']));
        whens.push({
          values,
          body: whenBody,
          loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
        });
      } else if (name === 'else') {
        this.advanceSegment();
        elseBody = this.parseBody(new Set(['endcase']));
      } else if (name === 'endcase') {
        this.advanceSegment();
        break;
      } else {
        this.addError('Expected {% when %}, {% else %}, or {% endcase %}', seg.offset, seg.raw.length);
        break;
      }
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Case',
      expression,
      whens,
      elseBody,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseCapture(openSeg: Segment): CaptureNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));
    const nameToken = ep.expect(TT.Identifier);

    const body = this.parseBody(new Set(['endcapture']));
    this.consumeEndTag('endcapture');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Capture',
      name: nameToken.value,
      body,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseRaw(openSeg: Segment): RawNode {
    const startOffset = openSeg.offset;
    let rawContent = '';

    // The scanner already extracted the raw content as a text segment
    // and the endraw as a tag segment. Collect text until endraw.
    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind === 'tag' && this.getTagName(seg.content) === 'endraw') {
        this.advanceSegment();
        break;
      }
      rawContent += seg.raw;
      this.advanceSegment();
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Raw',
      value: rawContent,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseComment(openSeg: Segment): CommentNode {
    const startOffset = openSeg.offset;
    let commentContent = '';

    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind === 'tag' && this.getTagName(seg.content) === 'endcomment') {
        this.advanceSegment();
        break;
      }
      commentContent += seg.raw;
      this.advanceSegment();
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Comment',
      value: commentContent,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseSchema(openSeg: Segment): SchemaNode {
    const startOffset = openSeg.offset;
    let jsonContent = '';

    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind === 'tag' && this.getTagName(seg.content) === 'endschema') {
        this.advanceSegment();
        break;
      }
      jsonContent += seg.raw;
      this.advanceSegment();
    }

    let parsedJSON: unknown = null;
    try {
      const trimmed = jsonContent.trim();
      if (trimmed) {
        parsedJSON = JSON.parse(trimmed);
      }
    } catch {
      this.addError('Invalid JSON in {% schema %} block', startOffset, jsonContent.length);
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Schema',
      jsonContent,
      parsedJSON,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseStyleBlock(openSeg: Segment): StyleNode {
    return this.parseRawContentBlock<StyleNode>(openSeg, 'endstyle', (value, loc) => ({
      type: 'Style',
      value,
      loc,
    }));
  }

  private parseJavaScriptBlock(openSeg: Segment): JavaScriptNode {
    return this.parseRawContentBlock<JavaScriptNode>(openSeg, 'endjavascript', (value, loc) => ({
      type: 'JavaScript',
      value,
      loc,
    }));
  }

  private parseStylesheetBlock(openSeg: Segment): StylesheetNode {
    return this.parseRawContentBlock<StylesheetNode>(openSeg, 'endstylesheet', (value, loc) => ({
      type: 'Stylesheet',
      value,
      loc,
    }));
  }

  private parseRawContentBlock<T>(
    openSeg: Segment,
    endTagName: string,
    factory: (value: string, loc: SourceLocation) => T,
  ): T {
    const startOffset = openSeg.offset;
    let content = '';

    while (this.pos < this.segments.length) {
      const seg = this.peekSegment()!;
      if (seg.kind === 'tag' && this.getTagName(seg.content) === endTagName) {
        this.advanceSegment();
        break;
      }
      content += seg.raw;
      this.advanceSegment();
    }

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return factory(content, offsetToLoc(this.source, startOffset, endOffset - startOffset));
  }

  private parseForm(openSeg: Segment): FormNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));

    const formType = ep.parsePrimary();
    const args: Expression[] = [];
    while (!ep.atEnd() && ep.peek().tt === TT.Comma) {
      ep.advance();
      args.push(ep.parsePrimary());
    }

    const body = this.parseBody(new Set(['endform']));
    this.consumeEndTag('endform');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Form',
      formType,
      args,
      body,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parsePaginate(openSeg: Segment): PaginateNode {
    const startOffset = openSeg.offset;
    const markup = this.getTagMarkup(openSeg.content);
    const ep = this.makeExprParser(markup, openSeg.contentOffset + openSeg.content.indexOf(markup));

    const collection = ep.parsePrimary();
    ep.matchId('by');
    const pageSize = ep.parsePrimary();

    const body = this.parseBody(new Set(['endpaginate']));
    this.consumeEndTag('endpaginate');

    const lastSeg = this.segments[this.pos - 1];
    const endOffset = lastSeg ? lastSeg.offset + lastSeg.raw.length : startOffset + openSeg.raw.length;

    return {
      type: 'Paginate',
      collection,
      pageSize,
      body,
      loc: offsetToLoc(this.source, startOffset, endOffset - startOffset),
    };
  }

  private parseAssign(seg: Segment): AssignNode {
    const markup = this.getTagMarkup(seg.content);
    const ep = this.makeExprParser(markup, seg.contentOffset + seg.content.indexOf(markup));

    const nameToken = ep.expect(TT.Identifier);
    ep.expect(TT.Assign);
    const value = ep.parseCondition();
    const filters = ep.parseFilterChain();

    return {
      type: 'Assign',
      name: nameToken.value,
      value,
      filters,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseRender(seg: Segment): RenderNode {
    const markup = this.getTagMarkup(seg.content);
    const ep = this.makeExprParser(markup, seg.contentOffset + seg.content.indexOf(markup));

    const snippetExpr = ep.parsePrimary();
    const snippetName = snippetExpr.type === 'StringLiteral' ? snippetExpr.value : '';

    let variable: Expression | null = null;
    let alias: string | null = null;
    let isFor = false;
    const args: { name: string; value: Expression }[] = [];

    // Parse "with expr" or "for expr" or keyword args
    while (!ep.atEnd()) {
      if (ep.matchId('with')) {
        variable = ep.parsePrimary();
        if (ep.matchId('as')) {
          const aliasToken = ep.expect(TT.Identifier);
          alias = aliasToken.value;
        }
      } else if (ep.matchId('for')) {
        isFor = true;
        variable = ep.parsePrimary();
        if (ep.matchId('as')) {
          const aliasToken = ep.expect(TT.Identifier);
          alias = aliasToken.value;
        }
      } else if (ep.peek().tt === TT.Comma) {
        ep.advance();
        // keyword arg: key: value
        if (ep.peek().tt === TT.Identifier) {
          const keyToken = ep.advance();
          if (ep.match(TT.Colon)) {
            const val = ep.parseCondition();
            args.push({ name: keyToken.value, value: val });
          }
        }
      } else {
        break;
      }
    }

    return {
      type: 'Render',
      snippetName,
      variable,
      alias,
      isFor,
      args,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseInclude(seg: Segment): IncludeNode {
    const markup = this.getTagMarkup(seg.content);
    const ep = this.makeExprParser(markup, seg.contentOffset + seg.content.indexOf(markup));

    const snippetExpr = ep.parsePrimary();
    const snippetName = snippetExpr.type === 'StringLiteral' ? snippetExpr.value : '';

    let variable: Expression | null = null;
    const args: { name: string; value: Expression }[] = [];

    while (!ep.atEnd()) {
      if (ep.matchId('with')) {
        variable = ep.parsePrimary();
      } else if (ep.peek().tt === TT.Comma) {
        ep.advance();
        if (ep.peek().tt === TT.Identifier) {
          const keyToken = ep.advance();
          if (ep.match(TT.Colon)) {
            const val = ep.parseCondition();
            args.push({ name: keyToken.value, value: val });
          }
        }
      } else {
        break;
      }
    }

    return {
      type: 'Include',
      snippetName,
      variable,
      args,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseSectionTag(seg: Segment): SectionTagNode {
    const markup = this.getTagMarkup(seg.content);
    const ep = this.makeExprParser(markup, seg.contentOffset + seg.content.indexOf(markup));
    const nameExpr = ep.parsePrimary();
    const name = nameExpr.type === 'StringLiteral' ? nameExpr.value : markup.trim().replace(/['"]/g, '');

    return {
      type: 'SectionTag',
      name,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseLayout(seg: Segment): LayoutNode {
    const markup = this.getTagMarkup(seg.content);
    const ep = this.makeExprParser(markup, seg.contentOffset + seg.content.indexOf(markup));
    const name = ep.parsePrimary();

    return {
      type: 'Layout',
      name,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseIncrement(seg: Segment): IncrementNode {
    const markup = this.getTagMarkup(seg.content).trim();
    return {
      type: 'Increment',
      name: markup,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  private parseDecrement(seg: Segment): DecrementNode {
    const markup = this.getTagMarkup(seg.content).trim();
    return {
      type: 'Decrement',
      name: markup,
      loc: offsetToLoc(this.source, seg.offset, seg.raw.length),
    };
  }

  // ── Utility ──

  private consumeEndTag(name: string): void {
    const seg = this.peekSegment();
    if (seg && seg.kind === 'tag' && this.getTagName(seg.content) === name) {
      this.advanceSegment();
    } else {
      const offset = seg ? seg.offset : (this.segments[this.pos - 1]?.offset ?? 0);
      const length = seg ? seg.raw.length : 0;
      this.addError(`Expected {% ${name} %}`, offset, length);
    }
  }

  private skipTextSegments(): void {
    while (
      this.pos < this.segments.length &&
      this.peekSegment()!.kind === 'text' &&
      this.peekSegment()!.content.trim() === ''
    ) {
      this.advanceSegment();
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a Liquid template into a typed AST.
 * Produces partial AST with collected errors on malformed input.
 */
export function parseLiquidAST(template: string): ParseResult {
  const segments = scanTemplate(template);
  const parser = new LiquidParser(segments, template);
  return parser.parse();
}

// ── AST to String ────────────────────────────────────────────────────────────

/**
 * Convert an AST back to a Liquid template string.
 * Used for round-trip validation: `astToString(parse(source)) ~= source`.
 */
export function astToString(nodes: LiquidASTNode[]): string {
  let out = '';
  for (const node of nodes) {
    out += nodeToString(node);
  }
  return out;
}

function exprToString(expr: Expression): string {
  switch (expr.type) {
    case 'VariableLookup': {
      let s = expr.name;
      for (const lookup of expr.lookups) {
        if (typeof lookup === 'string') {
          s += `.${lookup}`;
        } else {
          s += `[${exprToString(lookup)}]`;
        }
      }
      return s;
    }
    case 'StringLiteral':
      return `${expr.quote}${expr.value}${expr.quote}`;
    case 'NumberLiteral':
      return String(expr.value);
    case 'BooleanLiteral':
      return String(expr.value);
    case 'NilLiteral':
      return 'nil';
    case 'Range':
      return `(${exprToString(expr.start)}..${exprToString(expr.end)})`;
    case 'BinaryExpression':
      return `${exprToString(expr.left)} ${expr.operator} ${exprToString(expr.right)}`;
  }
}

function filtersToString(filters: FilterApplication[]): string {
  let s = '';
  for (const filter of filters) {
    s += ` | ${filter.name}`;
    if (filter.args.length > 0) {
      s += ': ' + filter.args.map(exprToString).join(', ');
    }
  }
  return s;
}

function nodeToString(node: LiquidASTNode): string {
  switch (node.type) {
    case 'Text':
      return node.value;

    case 'Output':
      return `{{ ${exprToString(node.expression)}${filtersToString(node.filters)} }}`;

    case 'Assign':
      return `{% assign ${node.name} = ${exprToString(node.value)}${filtersToString(node.filters)} %}`;

    case 'If': {
      let s = '';
      for (let i = 0; i < node.branches.length; i++) {
        const branch = node.branches[i];
        if (i === 0) {
          s += `{% if ${exprToString(branch.condition!)} %}`;
        } else if (branch.condition) {
          s += `{% elsif ${exprToString(branch.condition)} %}`;
        } else {
          s += '{% else %}';
        }
        s += astToString(branch.body);
      }
      s += '{% endif %}';
      return s;
    }

    case 'Unless': {
      let s = `{% unless ${exprToString(node.condition)} %}`;
      s += astToString(node.consequent);
      if (node.alternate.length > 0) {
        s += '{% else %}';
        s += astToString(node.alternate);
      }
      s += '{% endunless %}';
      return s;
    }

    case 'For': {
      let s = `{% for ${node.variable} in ${exprToString(node.collection)}`;
      if (node.limit) s += ` limit:${exprToString(node.limit)}`;
      if (node.offset) s += ` offset:${exprToString(node.offset)}`;
      if (node.reversed) s += ' reversed';
      s += ' %}';
      s += astToString(node.body);
      if (node.elseBody.length > 0) {
        s += '{% else %}';
        s += astToString(node.elseBody);
      }
      s += '{% endfor %}';
      return s;
    }

    case 'TableRow': {
      let s = `{% tablerow ${node.variable} in ${exprToString(node.collection)}`;
      if (node.limit) s += ` limit:${exprToString(node.limit)}`;
      if (node.offset) s += ` offset:${exprToString(node.offset)}`;
      if (node.cols) s += ` cols:${exprToString(node.cols)}`;
      s += ' %}';
      s += astToString(node.body);
      s += '{% endtablerow %}';
      return s;
    }

    case 'Case': {
      let s = `{% case ${exprToString(node.expression)} %}`;
      for (const when of node.whens) {
        s += `{% when ${when.values.map(exprToString).join(', ')} %}`;
        s += astToString(when.body);
      }
      if (node.elseBody.length > 0) {
        s += '{% else %}';
        s += astToString(node.elseBody);
      }
      s += '{% endcase %}';
      return s;
    }

    case 'Capture':
      return `{% capture ${node.name} %}${astToString(node.body)}{% endcapture %}`;

    case 'Raw':
      return `{% raw %}${node.value}{% endraw %}`;

    case 'Comment':
      return `{% comment %}${node.value}{% endcomment %}`;

    case 'Schema':
      return `{% schema %}${node.jsonContent}{% endschema %}`;

    case 'Form': {
      let s = `{% form ${exprToString(node.formType)}`;
      if (node.args.length > 0) {
        s += ', ' + node.args.map(exprToString).join(', ');
      }
      s += ' %}';
      s += astToString(node.body);
      s += '{% endform %}';
      return s;
    }

    case 'Paginate':
      return `{% paginate ${exprToString(node.collection)} by ${exprToString(node.pageSize)} %}${astToString(node.body)}{% endpaginate %}`;

    case 'Render': {
      let s = `{% render '${node.snippetName}'`;
      if (node.variable) {
        s += node.isFor ? ' for ' : ' with ';
        s += exprToString(node.variable);
        if (node.alias) s += ` as ${node.alias}`;
      }
      for (const arg of node.args) {
        s += `, ${arg.name}: ${exprToString(arg.value)}`;
      }
      s += ' %}';
      return s;
    }

    case 'Include': {
      let s = `{% include '${node.snippetName}'`;
      if (node.variable) {
        s += ' with ';
        s += exprToString(node.variable);
      }
      for (const arg of node.args) {
        s += `, ${arg.name}: ${exprToString(arg.value)}`;
      }
      s += ' %}';
      return s;
    }

    case 'SectionTag':
      return `{% section '${node.name}' %}`;

    case 'Layout':
      return `{% layout ${exprToString(node.name)} %}`;

    case 'Style':
      return `{% style %}${node.value}{% endstyle %}`;

    case 'JavaScript':
      return `{% javascript %}${node.value}{% endjavascript %}`;

    case 'Stylesheet':
      return `{% stylesheet %}${node.value}{% endstylesheet %}`;

    case 'Increment':
      return `{% increment ${node.name} %}`;

    case 'Decrement':
      return `{% decrement ${node.name} %}`;

    case 'Break':
      return '{% break %}';

    case 'Continue':
      return '{% continue %}';

    case 'LiquidTag':
      return `{% ${node.name}${node.markup ? ' ' + node.markup : ''} %}`;
  }
}
