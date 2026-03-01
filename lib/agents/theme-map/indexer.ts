/**
 * Theme Map Indexer — programmatic ThemeMap builder.
 *
 * Builds a structured intelligence map from AST chunks + dependency graph.
 * No LLM calls. Runs synchronously in <100ms for typical 200-file themes.
 *
 * Strategy:
 *   For each file → chunkFile() → extract features, keywords, dependencies
 *   Build cross-file dependency graph → compute dependsOn / renderedBy
 *   Compute global patterns + entry points
 */

import type { ThemeMap, ThemeMapFile, ThemeMapFeature } from './types';
import type { FileContext } from '@/lib/types/agent';
import { chunkFile, type ASTChunk } from '@/lib/parsers/ast-chunker';
import { ThemeDependencyGraph } from '@/lib/context/cross-language-graph';

// ── Minification detection (shared with old indexer) ───────────────────────

const MINIFIED_LINE_LENGTH_THRESHOLD = 500;
const MINIFIED_CHAR_THRESHOLD = 100_000;

function isMinifiedOrGenerated(path: string, content: string): boolean {
  if (path.includes('.min.') || path.includes('.bundle.')) return true;
  if (content.length > MINIFIED_CHAR_THRESHOLD) {
    const firstNewline = content.indexOf('\n');
    if (firstNewline === -1 || firstNewline > MINIFIED_LINE_LENGTH_THRESHOLD) return true;
  }
  const lines = content.split('\n');
  if (lines.length <= 3 && content.length > 10_000) return true;
  return false;
}

// ── Regex patterns for keyword extraction ──────────────────────────────────

const LIQUID_OBJECT_RE = /\{\{[-\s]*(\w+)\./g;
const LIQUID_FOR_RE = /\{%[-\s]*for\s+\w+\s+in\s+(\w+)/g;
const SCHEMA_RE = /\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/;
const CSS_CLASS_IN_HTML_RE = /class\s*=\s*["']([^"']+)["']/g;

// ── Purpose inference ──────────────────────────────────────────────────────

function inferPurpose(path: string, content: string): string {
  if (path.endsWith('.liquid')) {
    const schemaMatch = content.match(SCHEMA_RE);
    if (schemaMatch) {
      try {
        const schema = JSON.parse(schemaMatch[1]);
        if (schema.name) {
          const dir = path.split('/')[0];
          const suffix = dir === 'sections' ? 'section' : dir === 'snippets' ? 'snippet' : 'file';
          return `${schema.name} ${suffix}`;
        }
      } catch { /* fall through to path-based */ }
    }
  }

  const segments = path.split('/');
  const dir = segments[0];
  const filename = segments[segments.length - 1].replace(/\.\w+$/, '');
  const label = filename.replace(/[-_]/g, ' ');

  switch (dir) {
    case 'layout': return `${label} layout`;
    case 'templates': return `${label} template`;
    case 'sections': return `${label} section`;
    case 'snippets': return `${label} snippet`;
    case 'assets': {
      if (path.endsWith('.css')) return `${label} stylesheet`;
      if (path.endsWith('.js')) return `${label} script`;
      return `${label} asset`;
    }
    case 'config': return `${label} configuration`;
    case 'locales': return `${label} translations`;
    default: return `${label} file`;
  }
}

// ── Feature extraction from AST chunks ─────────────────────────────────────

function featureSlug(chunk: ASTChunk, index: number): string {
  switch (chunk.type) {
    case 'schema_setting':
      return `setting-${chunk.metadata.settingId ?? index}`;
    case 'schema_block':
      return `block-${chunk.metadata.settingId ?? index}`;
    case 'schema_preset':
      return `preset-${chunk.metadata.settingId ?? index}`;
    case 'render_call':
      return `render-${chunk.metadata.renderTarget ?? index}`;
    case 'liquid_block':
      return `${chunk.metadata.nodeType ?? 'block'}-L${chunk.lineStart}`;
    case 'css_rule': {
      const sel = (chunk.metadata.selector ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      return `css-${sel || `L${chunk.lineStart}`}`;
    }
    case 'js_function':
      return `fn-${chunk.metadata.functionName ?? `L${chunk.lineStart}`}`;
    case 'code_block':
      return chunk.metadata.settingId
        ? `json-${chunk.metadata.settingId}`
        : `block-L${chunk.lineStart}`;
  }
}

function featureDescription(chunk: ASTChunk): string {
  switch (chunk.type) {
    case 'schema_setting': {
      const name = chunk.metadata.settingLabel ?? chunk.metadata.settingId ?? 'setting';
      const type = chunk.metadata.settingType ? ` (${chunk.metadata.settingType})` : '';
      return `Schema setting: ${name}${type}`;
    }
    case 'schema_block':
      return `Schema block: ${chunk.metadata.settingLabel ?? chunk.metadata.settingId ?? 'block'}`;
    case 'schema_preset':
      return `Schema preset: ${chunk.metadata.settingLabel ?? chunk.metadata.settingId ?? 'preset'}`;
    case 'render_call':
      return `Renders ${chunk.metadata.renderTarget ?? 'snippet'}`;
    case 'liquid_block':
      return `Liquid ${chunk.metadata.nodeType ?? 'block'} (lines ${chunk.lineStart}-${chunk.lineEnd})`;
    case 'css_rule':
      return `CSS rule: ${chunk.metadata.selector ?? 'rule'}`;
    case 'js_function':
      return `Function: ${chunk.metadata.functionName ?? 'anonymous'}`;
    case 'code_block':
      if (chunk.metadata.settingId) return `JSON key: ${chunk.metadata.settingId}`;
      return `Code block (lines ${chunk.lineStart}-${chunk.lineEnd})`;
  }
}

function featureKeywords(chunk: ASTChunk): string[] {
  const kw: string[] = [];
  const m = chunk.metadata;
  if (m.settingId) kw.push(m.settingId);
  if (m.settingLabel) kw.push(m.settingLabel);
  if (m.settingType) kw.push(m.settingType);
  if (m.functionName) kw.push(m.functionName);
  if (m.renderTarget) kw.push(m.renderTarget);
  if (m.renderArgs) kw.push(...m.renderArgs);
  if (m.filterNames) kw.push(...m.filterNames);
  if (m.htmlClasses) kw.push(...m.htmlClasses);
  if (m.conditionExpression) {
    const vars = m.conditionExpression.match(/\b[a-z][\w.]*\b/g);
    if (vars) kw.push(...vars.filter(v => v.length > 2));
  }
  if (m.selector) {
    const classes = m.selector.match(/\.([a-zA-Z_][\w-]*)/g);
    if (classes) kw.push(...classes.map(c => c.slice(1)));
  }
  if (m.references) kw.push(...m.references);
  return [...new Set(kw)];
}

function extractFileKeywords(path: string, content: string, chunks: ASTChunk[]): string[] {
  const kw = new Set<string>();

  const pathParts = path.replace(/\.\w+$/, '').split(/[/\-_]/).filter(p => p.length > 2);
  for (const p of pathParts) kw.add(p);

  for (const chunk of chunks) {
    for (const k of featureKeywords(chunk)) kw.add(k);
  }

  for (const chunk of chunks) {
    if (chunk.metadata.filterNames) {
      for (const f of chunk.metadata.filterNames) kw.add(f);
    }
    if (chunk.metadata.htmlClasses) {
      for (const c of chunk.metadata.htmlClasses) kw.add(c);
    }
    if (chunk.metadata.renderArgs) {
      for (const a of chunk.metadata.renderArgs) kw.add(a);
    }
  }

  if (path.endsWith('.liquid')) {
    let m;
    const objRe = new RegExp(LIQUID_OBJECT_RE.source, 'g');
    while ((m = objRe.exec(content)) !== null) {
      if (m[1] !== 'section' && m[1] !== 'block') kw.add(m[1]);
    }
    const forRe = new RegExp(LIQUID_FOR_RE.source, 'g');
    while ((m = forRe.exec(content)) !== null) {
      kw.add(m[1]);
    }
    const classRe = new RegExp(CSS_CLASS_IN_HTML_RE.source, 'g');
    while ((m = classRe.exec(content)) !== null) {
      const classes = m[1].split(/\s+/).filter(c => c.length > 2 && !c.includes('{'));
      for (const cls of classes.slice(0, 10)) kw.add(cls);
    }
  }

  return [...kw];
}

// ── Pattern extraction ─────────────────────────────────────────────────────

function extractPatterns(chunks: ASTChunk[], content: string, path: string): string[] {
  const patterns: string[] = [];

  if (path.endsWith('.css')) {
    const prefixes = new Map<string, number>();
    for (const chunk of chunks) {
      if (chunk.metadata.selector) {
        const classMatch = chunk.metadata.selector.match(/\.([a-zA-Z_][\w]*)-/);
        if (classMatch) {
          prefixes.set(classMatch[1], (prefixes.get(classMatch[1]) ?? 0) + 1);
        }
      }
    }
    for (const [prefix, count] of prefixes) {
      if (count >= 3) patterns.push(`${prefix}- class prefix (${count} rules)`);
    }
  }

  if (path.endsWith('.liquid')) {
    if (content.includes('{% schema %}') || content.match(SCHEMA_RE)) {
      patterns.push('has schema');
    }
    if (/\{%[-\s]*javascript\s*[-\s]*%\}/.test(content)) {
      patterns.push('inline JavaScript');
    }
    if (/\{%[-\s]*stylesheet\s*[-\s]*%\}/.test(content)) {
      patterns.push('inline stylesheet');
    }
    const allFilters = new Set<string>();
    for (const chunk of chunks) {
      if (chunk.metadata.filterNames) {
        for (const f of chunk.metadata.filterNames) allFilters.add(f);
      }
    }
    if (allFilters.size > 0) {
      const notable = [...allFilters].filter(f =>
        ['image_url', 'asset_url', 'stylesheet_tag', 'script_tag', 'money', 'money_with_currency', 'json', 'escape', 't'].includes(f),
      );
      if (notable.length > 0) {
        patterns.push(`uses filters: ${notable.join(', ')}`);
      }
    }
  }

  return patterns;
}

function computeGlobalPatterns(allFiles: Record<string, ThemeMapFile>): string[] {
  const classPrefixCounts = new Map<string, number>();

  for (const file of Object.values(allFiles)) {
    for (const pattern of file.patterns) {
      const prefixMatch = pattern.match(/^(\S+)- class prefix/);
      if (prefixMatch) {
        classPrefixCounts.set(prefixMatch[1], (classPrefixCounts.get(prefixMatch[1]) ?? 0) + 1);
      }
    }
  }

  const patterns: string[] = [];
  for (const [prefix, count] of classPrefixCounts) {
    if (count >= 2) patterns.push(`${prefix}- class prefix across ${count} files`);
  }
  return patterns;
}

function computeEntryPoints(files: Record<string, ThemeMapFile>): string[] {
  return Object.keys(files)
    .filter(p => p.startsWith('layout/') || p.startsWith('templates/'))
    .sort();
}

// ── Framework detection ─────────────────────────────────────────────────────

interface FrameworkDetection {
  framework: string;
  signals: string[];
}

function detectFramework(
  files: Record<string, ThemeMapFile>,
  globalPatterns: string[],
): FrameworkDetection | null {
  const paths = Object.keys(files);
  const signals: string[] = [];

  // T4S (Kalles, Flavor, etc.)
  const t4sFiles = paths.filter(p => p.includes('t4s-') || p.includes('/t4s'));
  const hasT4sClasses = globalPatterns.some(p => p.includes('t4s-'));
  if (t4sFiles.length >= 3 || hasT4sClasses) {
    signals.push(...t4sFiles.slice(0, 3).map(f => `file: ${f}`));
    if (hasT4sClasses) signals.push('global pattern: t4s- class prefix');
    if (paths.some(p => p.includes('product-form-dynamic'))) signals.push('file: product-form-dynamic');
    return { framework: 'T4S', signals };
  }

  // Prestige
  const prestigeFiles = paths.filter(p => p.match(/assets\/prestige[.-]/));
  if (prestigeFiles.length >= 2) {
    signals.push(...prestigeFiles.slice(0, 3).map(f => `file: ${f}`));
    return { framework: 'Prestige', signals };
  }

  // Turbo
  const turboFiles = paths.filter(p => p.match(/assets\/turbo[.-]/));
  const hasIncludeSnippets = paths.filter(p => p.match(/snippets\/include-/)).length >= 3;
  if (turboFiles.length >= 2 || (turboFiles.length >= 1 && hasIncludeSnippets)) {
    signals.push(...turboFiles.slice(0, 3).map(f => `file: ${f}`));
    if (hasIncludeSnippets) signals.push('pattern: snippets/include-* convention');
    return { framework: 'Turbo', signals };
  }

  // Debut
  const isDebut = paths.includes('snippets/product-card.liquid') &&
    paths.includes('sections/collection-template.liquid');
  if (isDebut) {
    signals.push('file: snippets/product-card.liquid', 'file: sections/collection-template.liquid');
    return { framework: 'Debut', signals };
  }

  // Dawn (Shopify's reference theme)
  const hasDawnPattern = paths.filter(p => p.match(/sections\/main-.*\.liquid$/)).length >= 3;
  const hasProductForm = paths.includes('snippets/product-form.liquid');
  if (hasDawnPattern && hasProductForm) {
    signals.push('pattern: sections/main-*.liquid convention');
    signals.push('file: snippets/product-form.liquid');
    return { framework: 'Dawn', signals };
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a ThemeMap programmatically from file contents.
 * Uses AST chunking + dependency graph — no LLM calls.
 * Typical runtime: <100ms for a 200-file theme.
 */
export function indexTheme(
  projectId: string,
  files: FileContext[],
  _options?: { onProgress?: (msg: string) => void },
): ThemeMap {
  const startMs = Date.now();

  const hydratedFiles = files.filter(f => f.content && !f.content.startsWith('['));
  const indexableFiles = hydratedFiles.filter(f => {
    const path = f.path ?? f.fileName;
    return !isMinifiedOrGenerated(path, f.content!);
  });

  const graph = new ThemeDependencyGraph();
  graph.buildFromFiles(indexableFiles.map(f => ({
    path: f.path ?? f.fileName,
    content: f.content!,
  })));

  const themeFiles: Record<string, ThemeMapFile> = {};

  for (const file of indexableFiles) {
    const path = file.path ?? file.fileName;
    const content = file.content!;
    const chunks = chunkFile(content, path);

    const features: Record<string, ThemeMapFeature> = {};
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const slug = featureSlug(chunk, i);
      features[slug] = {
        lines: [chunk.lineStart, chunk.lineEnd],
        description: featureDescription(chunk),
        keywords: featureKeywords(chunk),
      };
    }

    const deps = graph.getDependencies(path);
    const dependsOn = [...new Set(deps.map(d => d.target))];
    const dependents = graph.getDependents(path);
    const renderedBy = [...new Set(dependents.map(d => d.source))];

    themeFiles[path] = {
      path,
      purpose: inferPurpose(path, content),
      features,
      dependsOn,
      renderedBy,
      patterns: extractPatterns(chunks, content, path),
    };
  }

  const elapsedMs = Date.now() - startMs;
  const globalPatterns = computeGlobalPatterns(themeFiles);
  const frameworkResult = detectFramework(themeFiles, globalPatterns);
  console.log(`[ThemeMap] Programmatic index: ${Object.keys(themeFiles).length} files in ${elapsedMs}ms${frameworkResult ? ` (framework: ${frameworkResult.framework})` : ''}`);

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    modelUsed: 'programmatic',
    fileCount: indexableFiles.length,
    version: 1,
    files: themeFiles,
    globalPatterns,
    entryPoints: computeEntryPoints(themeFiles),
    framework: frameworkResult?.framework,
    frameworkSignals: frameworkResult?.signals,
    intelligenceStatus: 'ready' as const,
  };
}

/**
 * Re-index a single file and merge the updated entry into the existing map.
 * Programmatic — re-chunks the file and updates its ThemeMap entry.
 */
export function reindexFile(
  existingMap: ThemeMap,
  file: FileContext,
  graph?: ThemeDependencyGraph,
): ThemeMap {
  const path = file.path ?? file.fileName;
  const content = file.content;
  if (!content || content.startsWith('[')) return existingMap;
  if (isMinifiedOrGenerated(path, content)) return existingMap;

  const chunks = chunkFile(content, path);

  const features: Record<string, ThemeMapFeature> = {};
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const slug = featureSlug(chunk, i);
    features[slug] = {
      lines: [chunk.lineStart, chunk.lineEnd],
      description: featureDescription(chunk),
      keywords: featureKeywords(chunk),
    };
  }

  let dependsOn = existingMap.files[path]?.dependsOn ?? [];
  let renderedBy = existingMap.files[path]?.renderedBy ?? [];
  if (graph) {
    graph.updateFile(path, content);
    dependsOn = [...new Set(graph.getDependencies(path).map(d => d.target))];
    renderedBy = [...new Set(graph.getDependents(path).map(d => d.source))];
  }

  return {
    ...existingMap,
    files: {
      ...existingMap.files,
      [path]: {
        path,
        purpose: inferPurpose(path, content),
        features,
        dependsOn,
        renderedBy,
        patterns: extractPatterns(chunks, content, path),
      },
    },
    version: existingMap.version + 1,
    generatedAt: new Date().toISOString(),
  };
}
