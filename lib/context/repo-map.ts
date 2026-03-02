/**
 * Repository Map — compact structural summary of a Shopify theme.
 *
 * Gives the PM agent a ranked, symbol-aware overview of the entire theme
 * so it can navigate files structurally instead of guessing with grep.
 *
 * Inspired by Aider's repo map (PageRank on call graph + tree-sitter tags),
 * adapted for Shopify themes (render/include graph, schema settings, CSS selectors).
 */

import type { FileContext } from '@/lib/types/agent';
import { ThemeDependencyGraph } from './cross-language-graph';
import { SymbolExtractor } from './symbol-extractor';
import { extractSchemaEntries } from '@/lib/parsers/schema-indexer';
import { estimateTokens } from '@/lib/ai/token-counter';

// ── Types ───────────────────────────────────────────────────────────────────

interface RepoMapEntry {
  path: string;
  type: 'section' | 'snippet' | 'layout' | 'template' | 'css' | 'js' | 'json' | 'locale' | 'config';
  lineCount: number;
  symbols: string[];
  renders: string[];
  schemaName: string | null;
  schemaSettingCount: number;
  schemaBlockCount: number;
  importance: number;
}

interface RepoMapOptions {
  activeFilePath?: string;
  mentionedFiles?: string[];
  maxTokens?: number;
}

// ── Importance scoring ──────────────────────────────────────────────────────

const BASE_SCORES: Record<string, number> = {
  layout: 10,
  config: 8,
  section: 5,
  template: 4,
  snippet: 3,
  css: 2,
  js: 2,
  json: 2,
  locale: 1,
};

function computeHeuristicScore(
  entry: RepoMapEntry,
  graph: ThemeDependencyGraph,
  mentionedSet: Set<string>,
  activeFile: string | undefined,
): number {
  let score = BASE_SCORES[entry.type] ?? 1;

  const dependents = graph.getDependents(entry.path);
  score += dependents.length * 2;

  if (mentionedSet.has(entry.path)) score += 20;
  if (mentionedSet.has(entry.path.split('/').pop()?.replace(/\.liquid$/, '') ?? '')) score += 20;

  if (activeFile) {
    if (entry.path === activeFile) score += 25;
    const activeDeps = graph.getDependencies(activeFile);
    const activeBasename = activeFile.split('/').pop()?.replace(/\.liquid$/, '') ?? '';
    if (activeDeps.some(d => d.target === entry.path || d.target === activeBasename)) score += 10;
    if (dependents.some(d => d.source === activeFile)) score += 10;
  }

  if (entry.schemaSettingCount > 10) score += 2;
  if (entry.lineCount > 500) score += 1;

  return score;
}

function computeImportance(
  entry: RepoMapEntry,
  graph: ThemeDependencyGraph,
  mentionedSet: Set<string>,
  activeFile: string | undefined,
  pageRankScores?: Map<string, number>,
): number {
  const heuristic = computeHeuristicScore(entry, graph, mentionedSet, activeFile);
  if (!pageRankScores || pageRankScores.size === 0) return heuristic;

  const rawPR = pageRankScores.get(entry.path) ?? 0;
  const maxPR = Math.max(...pageRankScores.values(), 0.001);
  const normalizedPR = (rawPR / maxPR) * 100;

  return 0.4 * normalizedPR + 0.6 * heuristic;
}

// ── Symbol extraction ───────────────────────────────────────────────────────

const extractor = new SymbolExtractor();

function extractSymbols(content: string, path: string): string[] {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'css') return extractor.extractCssClasses(content).slice(0, 8);
  if (ext === 'js') return extractor.extractJsFunctions(content).slice(0, 8);
  return [];
}

function extractRenders(content: string): string[] {
  const renders: string[] = [];
  const re = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (!renders.includes(m[1])) renders.push(m[1]);
  }
  return renders.slice(0, 10);
}

function extractSchemaInfo(content: string, filePath: string): {
  name: string | null;
  settingCount: number;
  blockCount: number;
} {
  const entries = extractSchemaEntries(content, filePath);
  const settings = entries.filter(e => e.entryType === 'setting').length;
  const blocks = entries.filter(e => e.entryType === 'block').length;

  const nameMatch = content.match(/\{%[-\s]*schema\s*[-\s]*%\}[\s\S]*?"name"\s*:\s*"([^"]+)"/);
  return { name: nameMatch?.[1] ?? null, settingCount: settings, blockCount: blocks };
}

// ── Map building ────────────────────────────────────────────────────────────

function inferType(path: string): RepoMapEntry['type'] {
  if (path.startsWith('sections/')) return 'section';
  if (path.startsWith('snippets/')) return 'snippet';
  if (path.startsWith('layout/')) return 'layout';
  if (path.startsWith('templates/')) return 'template';
  if (path.startsWith('config/')) return 'config';
  if (path.startsWith('locales/')) return 'locale';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.json')) return 'json';
  return 'snippet';
}

function buildEntries(files: FileContext[]): RepoMapEntry[] {
  return files.map(f => {
    const path = f.path ?? f.fileName;
    const content = f.content?.startsWith('[') ? '' : (f.content ?? '');
    const lineCount = content ? content.split('\n').length : 0;
    const type = inferType(path);

    let schemaName: string | null = null;
    let schemaSettingCount = 0;
    let schemaBlockCount = 0;
    if (type === 'section' && content) {
      const info = extractSchemaInfo(content, path);
      schemaName = info.name;
      schemaSettingCount = info.settingCount;
      schemaBlockCount = info.blockCount;
    }

    return {
      path,
      type,
      lineCount,
      symbols: content ? extractSymbols(content, path) : [],
      renders: content ? extractRenders(content) : [],
      schemaName,
      schemaSettingCount,
      schemaBlockCount,
      importance: 0,
    };
  });
}

function formatEntry(e: RepoMapEntry): string {
  const parts: string[] = [`${e.path} [${e.type}, ${e.lineCount} lines]`];
  const details: string[] = [];

  if (e.schemaName) details.push(`schema: "${e.schemaName}"`);
  if (e.schemaSettingCount > 0) details.push(`${e.schemaSettingCount} settings`);
  if (e.schemaBlockCount > 0) details.push(`${e.schemaBlockCount} blocks`);
  if (e.renders.length > 0) details.push(`renders: ${e.renders.join(', ')}`);
  if (e.symbols.length > 0) details.push(`symbols: ${e.symbols.join(', ')}`);

  if (details.length > 0) parts.push(`— ${details.join(' | ')}`);

  return parts.join(' ');
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildRepoMap(
  files: FileContext[],
  graph: ThemeDependencyGraph,
  options: RepoMapOptions = {},
): string {
  const maxTokens = options.maxTokens ?? 2000;
  const mentionedSet = new Set(options.mentionedFiles ?? []);

  const bias = new Map<string, number>();
  for (const m of mentionedSet) bias.set(m, 50);
  if (options.activeFilePath) bias.set(options.activeFilePath, 50);
  const pageRankScores = graph.computePageRank(bias.size > 0 ? bias : undefined);

  const entries = buildEntries(files);

  for (const entry of entries) {
    entry.importance = computeImportance(entry, graph, mentionedSet, options.activeFilePath, pageRankScores);
  }

  entries.sort((a, b) => b.importance - a.importance);

  // Binary search to fit within token budget
  let lo = 1;
  let hi = entries.length;
  let bestCount = Math.min(10, entries.length);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const text = entries.slice(0, mid).map(formatEntry).join('\n');
    const tokens = estimateTokens(text);
    if (tokens <= maxTokens) {
      bestCount = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const shown = entries.slice(0, bestCount);
  const hidden = entries.length - bestCount;

  const lines = shown.map(formatEntry);
  if (hidden > 0) {
    lines.push(`... and ${hidden} more files (use grep_content or search_files to find them)`);
  }

  return lines.join('\n');
}
