/**
 * AST-driven file chunker for Shopify theme files.
 *
 * - Liquid: schema → per-setting chunks, body → blocks at natural boundaries
 * - CSS: per-ruleset chunks
 * - JS: per-function chunks
 *
 * Falls back to regex-based extraction when tree-sitter is unavailable.
 */

import { getJSParser, getCSSParser, getLiquidParser, isTreeSitterAvailable, isLiquidParserAvailable } from './tree-sitter-loader';

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
    nodeType?: string;
    references?: string[];
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

// ── Liquid chunking (tree-sitter when available, regex fallback) ──────────

const SCHEMA_RE = /\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/;
const RENDER_RE = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
const BLOCK_OPEN_RE = /\{%-?\s*(?:if|unless|for|case|capture|form|paginate|tablerow)\b/;
const BLOCK_CLOSE_RE = /\{%-?\s*(?:endif|endunless|endfor|endcase|endcapture|endform|endpaginate|endtablerow)\b/;

function chunkLiquidTreeSitter(content: string, filePath: string): ASTChunk[] {
  const parser = getLiquidParser();
  if (!parser) return [];

  const tree = (parser as unknown as { parse(c: string): { rootNode: import('web-tree-sitter').Node } }).parse(content);
  const root = tree.rootNode;
  const chunks: ASTChunk[] = [];

  function walk(node: import('web-tree-sitter').Node) {
    if (node.type === 'schema_statement') {
      const jsonChild = node.children.find(
        (c: import('web-tree-sitter').Node) => c.type === 'raw_text' || c.type === 'json_content',
      );
      if (jsonChild) {
        const jsonText = content.slice(jsonChild.startIndex, jsonChild.endIndex).trim();
        try {
          const schema = JSON.parse(jsonText);
          for (const setting of schema.settings ?? []) {
            if (setting.type === 'header' || setting.type === 'paragraph') continue;
            chunks.push({
              type: 'schema_setting',
              content: JSON.stringify(setting, null, 2),
              file: filePath,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
              metadata: {
                settingId: setting.id,
                settingType: setting.type,
                settingLabel: setting.label,
              },
            });
          }
          for (const block of schema.blocks ?? []) {
            chunks.push({
              type: 'schema_block',
              content: JSON.stringify(block, null, 2),
              file: filePath,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
              metadata: {
                settingId: block.type,
                settingType: 'block',
                settingLabel: block.name,
              },
            });
          }
          for (const preset of schema.presets ?? []) {
            chunks.push({
              type: 'schema_preset',
              content: JSON.stringify(preset, null, 2),
              file: filePath,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
              metadata: {
                settingId: preset.name,
                settingType: 'preset',
                settingLabel: preset.name,
              },
            });
          }
        } catch {
          chunks.push({
            type: 'code_block',
            content: content.slice(node.startIndex, node.endIndex),
            file: filePath,
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1,
            metadata: { nodeType: 'schema_raw' },
          });
        }
      }
      return;
    }

    if (node.type === 'render_statement' || node.type === 'include_statement') {
      const nameChild = node.children.find(
        (c: import('web-tree-sitter').Node) => c.type === 'string' || c.type === 'string_content',
      );
      const target = nameChild
        ? content.slice(nameChild.startIndex, nameChild.endIndex).replace(/['"]/g, '')
        : '';
      chunks.push({
        type: 'render_call',
        content: content.slice(node.startIndex, node.endIndex),
        file: filePath,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        metadata: { renderTarget: target },
      });
      return;
    }

    const blockTypes = new Set([
      'if_statement', 'unless_statement', 'for_statement', 'case_statement',
      'capture_statement', 'form_statement', 'paginate_statement', 'tablerow_statement',
    ]);
    if (blockTypes.has(node.type)) {
      const span = node.endPosition.row - node.startPosition.row;
      if (span >= 3 && span <= 200) {
        chunks.push({
          type: 'liquid_block',
          content: content.slice(node.startIndex, node.endIndex),
          file: filePath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          metadata: { nodeType: node.type.replace('_statement', '') },
        });
        return;
      }
      // Large blocks (>200 lines): recurse into children for finer granularity
      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i)!);
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i)!);
    }
  }

  walk(root);
  return chunks;
}

function chunkLiquid(content: string, filePath: string): ASTChunk[] {
  if (isLiquidParserAvailable()) {
    const tsChunks = chunkLiquidTreeSitter(content, filePath);
    if (tsChunks.length > 0) return tsChunks;
  }
  return chunkLiquidRegex(content, filePath);
}

function chunkLiquidRegex(content: string, filePath: string): ASTChunk[] {
  const chunks: ASTChunk[] = [];
  const lines = content.split('\n');

  // Extract schema
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
          lineStart: schemaStart,
          lineEnd: schemaEnd,
          metadata: {
            settingId: setting.id,
            settingType: setting.type,
            settingLabel: setting.label,
          },
        });
      }

      for (const block of schema.blocks ?? []) {
        chunks.push({
          type: 'schema_block',
          content: JSON.stringify(block, null, 2),
          file: filePath,
          lineStart: schemaStart,
          lineEnd: schemaEnd,
          metadata: {
            settingId: block.type,
            settingType: 'block',
            settingLabel: block.name,
          },
        });
      }

      for (const preset of schema.presets ?? []) {
        chunks.push({
          type: 'schema_preset',
          content: JSON.stringify(preset, null, 2),
          file: filePath,
          lineStart: schemaStart,
          lineEnd: schemaEnd,
          metadata: {
            settingId: preset.name,
            settingType: 'preset',
            settingLabel: preset.name,
          },
        });
      }
    } catch {
      // Malformed schema — chunk as raw block
      chunks.push({
        type: 'code_block',
        content: schemaMatch[0],
        file: filePath,
        lineStart: schemaStart,
        lineEnd: schemaEnd,
        metadata: { nodeType: 'schema_raw' },
      });
    }
  }

  // Extract render/include calls
  let renderMatch;
  const renderRe = new RegExp(RENDER_RE.source, 'g');
  while ((renderMatch = renderRe.exec(content)) !== null) {
    const line = content.slice(0, renderMatch.index).split('\n').length;
    chunks.push({
      type: 'render_call',
      content: renderMatch[0],
      file: filePath,
      lineStart: line,
      lineEnd: line,
      metadata: { renderTarget: renderMatch[1] },
    });
  }

  // Chunk body at block boundaries (if/for/unless/case) at ALL nesting depths.
  // Blocks >200 lines are skipped so their inner blocks get chunked instead.
  const blockStack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BLOCK_OPEN_RE.test(line)) {
      blockStack.push(i);
    }
    if (BLOCK_CLOSE_RE.test(line) && blockStack.length > 0) {
      const start = blockStack.pop()!;
      const span = i - start + 1;
      if (span >= 3 && span <= 200) {
        const blockContent = lines.slice(start, i + 1).join('\n');
        chunks.push({
          type: 'liquid_block',
          content: blockContent,
          file: filePath,
          lineStart: start + 1,
          lineEnd: i + 1,
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
