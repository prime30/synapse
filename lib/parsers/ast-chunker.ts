/**
 * AST-driven file chunker for Shopify theme files.
 *
 * - Liquid: uses @shopify/liquid-html-parser for structured AST (schema, render/include, blocks, filters)
 * - CSS: tree-sitter per-ruleset chunks
 * - JS: tree-sitter per-function chunks
 *
 * Falls back to regex-based extraction when parsers are unavailable.
 */

import { getJSParser, getCSSParser } from './tree-sitter-loader';
import { toLiquidHtmlAST, walk as walkLiquidAST, NodeTypes } from '@shopify/liquid-html-parser';
import type { LiquidHtmlNode, DocumentNode } from '@shopify/liquid-html-parser';

export interface ASTChunk {
  type: 'schema_setting' | 'schema_block' | 'schema_preset' | 'liquid_block' | 'render_call' | 'css_rule' | 'js_function' | 'code_block';
  content: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  metadata: {
    settingId?: string;
    settingType?: string;
    settingLabel?: string;
    functionName?: string;
    selector?: string;
    renderTarget?: string;
    renderArgs?: string[];
    filterNames?: string[];
    nodeType?: string;
    references?: string[];
    htmlClasses?: string[];
    conditionExpression?: string;
  };
}

// ── Chunk cache (avoid re-parsing unchanged files) ────────────────────────

const chunkCache = new Map<string, { hash: string; chunks: ASTChunk[] }>();

function simpleHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ── Position helpers ──────────────────────────────────────────────────────

function offsetToLine(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

// ── Liquid chunking via @shopify/liquid-html-parser ───────────────────────

const BLOCK_TAG_NAMES = new Set([
  'if', 'unless', 'for', 'case', 'capture', 'form', 'paginate', 'tablerow',
]);

function chunkLiquidAST(content: string, filePath: string): ASTChunk[] {
  let ast: DocumentNode;
  try {
    ast = toLiquidHtmlAST(content, { mode: 'tolerant', allowUnclosedDocumentNode: true });
  } catch {
    return chunkLiquidRegex(content, filePath);
  }

  const chunks: ASTChunk[] = [];
  const fileFilters: string[] = [];

  walkLiquidAST(ast, (node: LiquidHtmlNode) => {
    if (node.type === NodeTypes.LiquidRawTag && node.name === 'schema') {
      const jsonText = typeof node.body === 'object' && 'value' in node.body
        ? (node.body as { value: string }).value
        : content.slice(node.position.start, node.position.end)
            .replace(/\{%[-\s]*schema\s*[-\s]*%\}/, '')
            .replace(/\{%[-\s]*endschema\s*[-\s]*%\}/, '')
            .trim();
      const lineStart = offsetToLine(content, node.position.start);
      const lineEnd = offsetToLine(content, node.position.end);
      try {
        const schema = JSON.parse(jsonText);
        for (const setting of schema.settings ?? []) {
          if (setting.type === 'header' || setting.type === 'paragraph') continue;
          chunks.push({
            type: 'schema_setting',
            content: JSON.stringify(setting, null, 2),
            file: filePath, lineStart, lineEnd,
            metadata: { settingId: setting.id, settingType: setting.type, settingLabel: setting.label },
          });
        }
        for (const block of schema.blocks ?? []) {
          chunks.push({
            type: 'schema_block',
            content: JSON.stringify(block, null, 2),
            file: filePath, lineStart, lineEnd,
            metadata: { settingId: block.type, settingType: 'block', settingLabel: block.name },
          });
        }
        for (const preset of schema.presets ?? []) {
          chunks.push({
            type: 'schema_preset',
            content: JSON.stringify(preset, null, 2),
            file: filePath, lineStart, lineEnd,
            metadata: { settingId: preset.name, settingType: 'preset', settingLabel: preset.name },
          });
        }
      } catch {
        chunks.push({
          type: 'code_block',
          content: content.slice(node.position.start, node.position.end),
          file: filePath, lineStart, lineEnd,
          metadata: { nodeType: 'schema_raw' },
        });
      }
      return;
    }

    if (node.type === NodeTypes.LiquidTag && (node.name === 'render' || node.name === 'include')) {
      const lineStart = offsetToLine(content, node.position.start);
      const lineEnd = offsetToLine(content, node.position.end);
      let target = '';
      const renderArgs: string[] = [];

      if (node.markup && typeof node.markup === 'object' && 'snippet' in node.markup) {
        const rm = node.markup as { snippet?: string | { value?: string }; args?: Array<{ name?: string }> };
        target = typeof rm.snippet === 'string' ? rm.snippet
          : rm.snippet?.value ?? '';
        if (rm.args) {
          for (const arg of rm.args) {
            if (arg.name) renderArgs.push(arg.name);
          }
        }
      }
      if (!target) {
        const raw = typeof node.markup === 'string' ? node.markup : '';
        const nameMatch = raw.match(/['"]([^'"]+)['"]/);
        if (nameMatch) target = nameMatch[1];
      }

      chunks.push({
        type: 'render_call',
        content: content.slice(node.position.start, node.position.end),
        file: filePath, lineStart, lineEnd,
        metadata: { renderTarget: target, renderArgs: renderArgs.length > 0 ? renderArgs : undefined },
      });
      return;
    }

    if (node.type === NodeTypes.LiquidTag && BLOCK_TAG_NAMES.has(node.name)) {
      const lineStart = offsetToLine(content, node.position.start);
      const lineEnd = offsetToLine(content, node.position.end);
      const span = lineEnd - lineStart;
      if (span >= 3 && span <= 200) {
        let condExpr: string | undefined;
        if (typeof node.markup === 'string' && node.markup.trim()) {
          condExpr = node.markup.trim();
        }
        chunks.push({
          type: 'liquid_block',
          content: content.slice(node.position.start, node.position.end),
          file: filePath, lineStart, lineEnd,
          metadata: { nodeType: node.name, conditionExpression: condExpr },
        });
      }
      return;
    }

    if (node.type === NodeTypes.LiquidVariableOutput) {
      const filters: string[] = [];
      if (node.markup && typeof node.markup === 'object' && 'filters' in node.markup) {
        const variable = node.markup as { filters?: Array<{ name?: string }> };
        for (const f of variable.filters ?? []) {
          if (f.name) filters.push(f.name);
        }
      }
      if (filters.length > 0) {
        fileFilters.push(...filters);
      }
    }

    if (
      node.type === NodeTypes.HtmlElement ||
      node.type === NodeTypes.HtmlVoidElement ||
      node.type === NodeTypes.HtmlSelfClosingElement
    ) {
      const attrs = 'attributes' in node ? (node.attributes as Array<{ name?: Array<{ value?: string }> | string; value?: Array<{ value?: string }> | string }>) : [];
      for (const attr of attrs) {
        const attrName = Array.isArray(attr.name) ? attr.name.map(n => n.value ?? '').join('') : (typeof attr.name === 'string' ? attr.name : '');
        if (attrName === 'class') {
          const val = Array.isArray(attr.value) ? attr.value.map(v => v.value ?? '').join('') : (typeof attr.value === 'string' ? attr.value : '');
          if (val) {
            const classes = val.split(/\s+/).filter(c => c.length > 2 && !c.includes('{'));
            if (classes.length > 0) {
              fileFilters.push(...classes.slice(0, 10).map(c => `class:${c}`));
            }
          }
        }
      }
    }
  });

  if (fileFilters.length > 0 && chunks.length > 0) {
    const filterNames = [...new Set(fileFilters.filter(f => !f.startsWith('class:')))];
    const htmlClasses = [...new Set(fileFilters.filter(f => f.startsWith('class:')).map(f => f.slice(6)))];
    const first = chunks[0];
    if (!first.metadata.filterNames && filterNames.length > 0) first.metadata.filterNames = filterNames;
    if (!first.metadata.htmlClasses && htmlClasses.length > 0) first.metadata.htmlClasses = htmlClasses;
  }

  return chunks;
}

const SCHEMA_RE = /\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/;
const RENDER_RE = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
const BLOCK_OPEN_RE = /\{%-?\s*(?:if|unless|for|case|capture|form|paginate|tablerow)\b/;
const BLOCK_CLOSE_RE = /\{%-?\s*(?:endif|endunless|endfor|endcase|endcapture|endform|endpaginate|endtablerow)\b/;

function chunkLiquid(content: string, filePath: string): ASTChunk[] {
  const astChunks = chunkLiquidAST(content, filePath);
  if (astChunks.length > 0) return astChunks;
  return chunkLiquidRegex(content, filePath);
}

function chunkLiquidRegex(content: string, filePath: string): ASTChunk[] {
  const chunks: ASTChunk[] = [];
  const lines = content.split('\n');

  const schemaMatch = content.match(SCHEMA_RE);
  if (schemaMatch) {
    const schemaStart = content.slice(0, schemaMatch.index!).split('\n').length;
    const schemaEnd = schemaStart + schemaMatch[0].split('\n').length - 1;

    try {
      const schema = JSON.parse(schemaMatch[1]);

      for (const setting of schema.settings ?? []) {
        chunks.push({
          type: 'schema_setting',
          content: JSON.stringify(setting, null, 2),
          file: filePath,
          lineStart: schemaStart, lineEnd: schemaEnd,
          metadata: { settingId: setting.id, settingType: setting.type, settingLabel: setting.label },
        });
      }

      for (const block of schema.blocks ?? []) {
        chunks.push({
          type: 'schema_block',
          content: JSON.stringify(block, null, 2),
          file: filePath,
          lineStart: schemaStart, lineEnd: schemaEnd,
          metadata: { settingId: block.type, settingType: 'block', settingLabel: block.name },
        });
      }

      for (const preset of schema.presets ?? []) {
        chunks.push({
          type: 'schema_preset',
          content: JSON.stringify(preset, null, 2),
          file: filePath,
          lineStart: schemaStart, lineEnd: schemaEnd,
          metadata: { settingId: preset.name, settingType: 'preset', settingLabel: preset.name },
        });
      }
    } catch {
      chunks.push({
        type: 'code_block',
        content: schemaMatch[0],
        file: filePath,
        lineStart: schemaStart, lineEnd: schemaEnd,
        metadata: { nodeType: 'schema_raw' },
      });
    }
  }

  let renderMatch;
  const renderRe = new RegExp(RENDER_RE.source, 'g');
  while ((renderMatch = renderRe.exec(content)) !== null) {
    const line = content.slice(0, renderMatch.index).split('\n').length;
    chunks.push({
      type: 'render_call',
      content: renderMatch[0],
      file: filePath,
      lineStart: line, lineEnd: line,
      metadata: { renderTarget: renderMatch[1] },
    });
  }

  const blockStack: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BLOCK_OPEN_RE.test(line)) blockStack.push(i);
    if (BLOCK_CLOSE_RE.test(line) && blockStack.length > 0) {
      const start = blockStack.pop()!;
      const span = i - start + 1;
      if (span >= 3 && span <= 200) {
        const blockContent = lines.slice(start, i + 1).join('\n');
        chunks.push({
          type: 'liquid_block',
          content: blockContent,
          file: filePath,
          lineStart: start + 1, lineEnd: i + 1,
          metadata: { nodeType: line.match(/\{%[-\s]*(\w+)/)?.[1] ?? 'block' },
        });
      }
    }
  }

  return chunks;
}

// ── CSS chunking (tree-sitter when available, regex fallback) ──────────────

function chunkCSS(content: string, filePath: string): ASTChunk[] {
  const cssParser = getCSSParser();
  if (cssParser) {
    return chunkCSSTreeSitter(cssParser, content, filePath);
  }
  return chunkCSSRegex(content, filePath);
}

function chunkCSSTreeSitter(
  parser: import('web-tree-sitter').Parser,
  content: string,
  filePath: string,
): ASTChunk[] {
  const tree = parser.parse(content);
  if (!tree) return [];
  const chunks: ASTChunk[] = [];

  for (const node of tree.rootNode.children) {
    if (node.type === 'rule_set' || node.type === 'media_statement' || node.type === 'at_rule') {
      const selectorNode = node.children.find(c => c.type === 'selectors');
      chunks.push({
        type: 'css_rule',
        content: content.slice(node.startIndex, node.endIndex),
        file: filePath,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        metadata: {
          selector: selectorNode
            ? content.slice(selectorNode.startIndex, selectorNode.endIndex)
            : undefined,
          nodeType: node.type,
        },
      });
    }
  }
  return chunks;
}

function chunkCSSRegex(content: string, filePath: string): ASTChunk[] {
  const chunks: ASTChunk[] = [];
  const ruleRe = /^([^{@\n][^{]*)\{/gm;
  let match;
  while ((match = ruleRe.exec(content)) !== null) {
    const start = content.slice(0, match.index).split('\n').length;
    const braceStart = match.index + match[0].length - 1;
    let depth = 1;
    let end = braceStart + 1;
    while (end < content.length && depth > 0) {
      if (content[end] === '{') depth++;
      if (content[end] === '}') depth--;
      end++;
    }
    const ruleContent = content.slice(match.index, end);
    const endLine = start + ruleContent.split('\n').length - 1;
    chunks.push({
      type: 'css_rule',
      content: ruleContent,
      file: filePath,
      lineStart: start,
      lineEnd: endLine,
      metadata: { selector: match[1].trim() },
    });
  }
  return chunks;
}

// ── JS chunking (tree-sitter when available, regex fallback) ───────────────

function chunkJS(content: string, filePath: string): ASTChunk[] {
  const parser = getJSParser();
  if (parser) {
    return chunkJSTreeSitter(parser, content, filePath);
  }
  return chunkJSRegex(content, filePath);
}

function chunkJSTreeSitter(
  parser: import('web-tree-sitter').Parser,
  content: string,
  filePath: string,
): ASTChunk[] {
  const tree = parser.parse(content);
  if (!tree) return [];
  const chunks: ASTChunk[] = [];

  function walk(node: import('web-tree-sitter').Node) {
    if (
      node.type === 'function_declaration' ||
      node.type === 'arrow_function' ||
      node.type === 'method_definition' ||
      node.type === 'class_declaration'
    ) {
      const nameNode = node.children.find(c => c.type === 'identifier' || c.type === 'property_identifier');
      chunks.push({
        type: 'js_function',
        content: content.slice(node.startIndex, node.endIndex),
        file: filePath,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        metadata: {
          functionName: nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : undefined,
          nodeType: node.type,
        },
      });
      return; // Don't recurse into function bodies
    }

    // For variable declarations with arrow functions (const fn = () => {})
    if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      for (const declarator of node.children) {
        if (declarator.type === 'variable_declarator') {
          const value = declarator.children.find(c => c.type === 'arrow_function' || c.type === 'function_expression');
          if (value) {
            const nameNode = declarator.children.find(c => c.type === 'identifier');
            chunks.push({
              type: 'js_function',
              content: content.slice(node.startIndex, node.endIndex),
              file: filePath,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
              metadata: {
                functionName: nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : undefined,
                nodeType: 'arrow_function',
              },
            });
            return;
          }
        }
      }
    }

    for (const child of node.children) walk(child);
  }

  walk(tree.rootNode);
  return chunks;
}

function chunkJSRegex(content: string, filePath: string): ASTChunk[] {
  const chunks: ASTChunk[] = [];
  const funcRe = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g;
  let match;

  while ((match = funcRe.exec(content)) !== null) {
    const name = match[1] ?? match[2];
    const startLine = content.slice(0, match.index).split('\n').length;
    // Find matching closing brace
    const braceIdx = content.indexOf('{', match.index + match[0].length);
    if (braceIdx === -1) continue;
    let depth = 1;
    let end = braceIdx + 1;
    while (end < content.length && depth > 0) {
      if (content[end] === '{') depth++;
      if (content[end] === '}') depth--;
      end++;
    }
    const funcContent = content.slice(match.index, end);
    const endLine = startLine + funcContent.split('\n').length - 1;
    chunks.push({
      type: 'js_function',
      content: funcContent,
      file: filePath,
      lineStart: startLine,
      lineEnd: endLine,
      metadata: { functionName: name },
    });
  }
  return chunks;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function chunkFile(content: string, filePath: string): ASTChunk[] {
  const hash = simpleHash(content);
  const cached = chunkCache.get(filePath);
  if (cached && cached.hash === hash) return cached.chunks;

  const chunks = chunkFileUncached(content, filePath);
  chunkCache.set(filePath, { hash, chunks });
  return chunks;
}

function chunkFileUncached(content: string, filePath: string): ASTChunk[] {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'liquid') return chunkLiquid(content, filePath);
  if (ext === 'css') return chunkCSS(content, filePath);
  if (ext === 'js' || ext === 'ts') return chunkJS(content, filePath);

  // JSON files: chunk top-level keys
  if (ext === 'json') {
    try {
      const obj = JSON.parse(content);
      return Object.entries(obj).map(([key, value], i) => ({
        type: 'code_block' as const,
        content: JSON.stringify({ [key]: value }, null, 2),
        file: filePath,
        lineStart: 1,
        lineEnd: content.split('\n').length,
        metadata: { settingId: key, nodeType: 'json_key' },
      }));
    } catch { /* fall through */ }
  }

  return [{
    type: 'code_block',
    content,
    file: filePath,
    lineStart: 1,
    lineEnd: content.split('\n').length,
    metadata: { nodeType: 'raw' },
  }];
}
