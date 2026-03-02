/**
 * coordinator-context.ts — Pre-loop context building helpers.
 *
 * Extracted from coordinator-v2.ts (original lines 440–1193, 1735–1750).
 * All functions here are pure or pre-loop — they have zero closure
 * dependencies on the main while-loop state.
 */

import type {
  CodeChange,
  FileContext,
  ScoutBrief,
  RoutingTier,
} from '@/lib/types/agent';
import type { ThemeDependencyGraph } from '@/lib/context/cross-language-graph';
import type { ShopifyFileTree, ShopifyFileTreeEntry } from '@/lib/supabase/shopify-file-tree';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import type { ReferentialArtifact, ExecutionStrategy } from './coordinator-types';
import { getProjectContextEngine } from '@/lib/ai/context-engine';
import { SymbolGraphCache } from '@/lib/context/symbol-graph-cache';
import type { FileContext as GraphFileContext } from '@/lib/context/types';
import { recordHistogram } from '@/lib/observability/metrics';

// ── Prompt file extraction ──────────────────────────────────────────────────

/**
 * Extract file references from the user's prompt and resolve them to FileContext.
 * Matches explicit paths (e.g., "product-thumbnail.liquid") and keyword fuzzy match.
 */
export function extractPromptMentionedFiles(
  userRequest: string,
  files: FileContext[],
): FileContext[] {
  const matched: FileContext[] = [];
  const matchedIds = new Set<string>();

  const explicitRe = /[\w./-]+\.(liquid|css|js|json|scss)/gi;
  const explicitMatches = userRequest.match(explicitRe) ?? [];
  for (const ref of explicitMatches) {
    const normalized = ref.replace(/\\/g, '/').toLowerCase();
    const file = files.find(
      f =>
        f.fileName.toLowerCase() === normalized ||
        f.path?.toLowerCase() === normalized ||
        f.fileName.toLowerCase().endsWith(normalized),
    );
    if (file && !matchedIds.has(file.fileId)) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'been', 'should',
    'would', 'could', 'when', 'what', 'where', 'which', 'their',
    'about', 'after', 'before', 'between', 'each', 'every', 'into',
    'through', 'during', 'using', 'make', 'like', 'also', 'just',
    'only', 'some', 'them', 'than', 'then', 'very', 'well', 'here',
    'there', 'does', 'show', 'create', 'adding', 'find',
  ]);
  const keywords = userRequest
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  for (const file of files) {
    if (matchedIds.has(file.fileId)) continue;
    const fn = file.fileName.toLowerCase().replace(/[_.\-]/g, ' ');
    const hits = keywords.filter(kw => fn.includes(kw));
    if (hits.length >= 2) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  return matched.slice(0, 6);
}

// ── Fast Edit Path ──────────────────────────────────────────────────────────

export function isFastEditEligible(
  intentMode: string,
  tier: RoutingTier,
  userRequest: string,
  preloaded: FileContext[],
): boolean {
  if (intentMode !== 'code') return false;
  if (tier !== 'SIMPLE' && tier !== 'TRIVIAL') return false;

  const hasPreloadedContent = preloaded.some(
    f => f.content && !f.content.startsWith('[') && f.content.length > 10,
  );
  if (!hasPreloadedContent) return false;

  const investigationRe = /\b(find|investigate|debug|diagnose|check|why|trace|root cause|not (?:showing|working|loading|updating)|broken|missing|error)\b/i;
  if (investigationRe.test(userRequest)) return false;

  return true;
}

export const FAST_EDIT_SYSTEM_SUFFIX = `

## FAST EDIT MODE

You have ONE turn to complete this task. The target file is pre-loaded in your context.
- Make the edit immediately using search_replace or propose_code_edit.
- Do NOT call read_file, search_files, grep_content, list_files, or glob_files.
- After editing, call check_lint on the modified file.
- Be precise and complete in a single response.`;

// ── File Context Rule ───────────────────────────────────────────────────────

export function enforceFileContextRule(
  changes: CodeChange[],
  contextFiles: FileContext[],
  readFiles?: Set<string>,
): { allowed: CodeChange[]; rejected: CodeChange[] } {
  const contextFileNames = new Set(contextFiles.map((f) => f.fileName));
  const contextFileIds = new Set(contextFiles.map((f) => f.fileId));

  const allowed: CodeChange[] = [];
  const rejected: CodeChange[] = [];

  for (const change of changes) {
    const isNewFile = change.fileId.startsWith('new_');
    const inContext = contextFileNames.has(change.fileName) || contextFileIds.has(change.fileId);
    const wasRead = readFiles?.has(change.fileName) || readFiles?.has(change.fileId);
    if (isNewFile || inContext || wasRead) {
      allowed.push(change);
    } else {
      rejected.push(change);
    }
  }

  return { allowed, rejected };
}

// ── Referential artifact helpers ────────────────────────────────────────────

export function buildFallbackClarificationOptions(
  allFiles: FileContext[],
  artifacts: ReferentialArtifact[],
): Array<{ id: string; label: string; recommended?: boolean }> {
  const fileHints = artifacts
    .map((a) => a.filePath?.trim())
    .filter((p): p is string => Boolean(p))
    .slice(0, 3);
  const fallbackFiles = allFiles.slice(0, 3).map((f) => f.fileName);
  const targets = fileHints.length > 0 ? fileHints : fallbackFiles;
  const options = targets.map((p, idx) => ({
    id: `target-${idx + 1}`,
    label: `Use \`${p}\` as the target file for this edit.`,
    recommended: idx === 0,
  }));
  options.push({
    id: 'provide-snippet',
    label: 'I will paste the exact before/after snippet to apply.',
    recommended: false,
  });
  options.push({
    id: 'replay-last-edits',
    label: 'Replay the latest suggested edits as-is.',
    recommended: false,
  });
  return options;
}

export function applyReferentialArtifactsAsChanges(
  artifacts: ReferentialArtifact[],
  allFiles: FileContext[],
  preloadedMap: Map<string, FileContext>,
  accumulatedChanges: CodeChange[],
): { applied: number; skipped: number; missing: string[] } {
  let applied = 0;
  let skipped = 0;
  const missing: string[] = [];

  const norm = (p: string) => p.replace(/\\/g, '/').trim().toLowerCase();
  for (const artifact of artifacts.slice(0, 8)) {
    const targetPath = artifact.filePath?.trim();
    if (!targetPath) {
      skipped += 1;
      continue;
    }
    const targetNorm = norm(targetPath);
    let target = allFiles.find(
      (f) => norm(f.fileName) === targetNorm || norm(f.path ?? '') === targetNorm,
    );
    if (!target) {
      const basename = targetNorm.split('/').pop();
      if (basename) {
        target = allFiles.find(
          (f) =>
            norm(f.fileName).endsWith(`/${basename}`) ||
            norm(f.fileName) === basename ||
            (f.path && norm(f.path).endsWith(`/${basename}`)),
        );
      }
    }
    if (!target) {
      missing.push(targetPath);
      continue;
    }
    if ((target.content ?? '') === artifact.newContent) {
      skipped += 1;
      continue;
    }

    const change: CodeChange = {
      fileId: target.fileId,
      fileName: target.fileName,
      originalContent: target.content,
      proposedContent: artifact.newContent,
      reasoning: artifact.reasoning ?? 'Replayed referential artifact from prior assistant suggestion.',
      agentType: 'project_manager',
    };
    accumulatedChanges.push(change);
    target.content = artifact.newContent;
    preloadedMap.set(target.fileName, target);
    if (target.path) {
      preloadedMap.set(target.path, target);
    }
    applied += 1;
  }

  return { applied, skipped, missing };
}

// ── Style-aware context helpers ─────────────────────────────────────────────

export function selectReferenceSections(
  userRequest: string,
  activeFilePath: string | undefined,
  allFiles: FileContext[],
  fileTree: ShopifyFileTree | null,
  maxRefs: number = 3,
): FileContext[] {
  const isSection = activeFilePath?.startsWith('sections/') ?? false;
  const sectionIntent = /(?:create|add|edit|update|modify|change)\s+(?:a\s+)?(?:new\s+)?section/i.test(userRequest);
  if (!isSection && !sectionIntent) return [];

  const likeMatch = userRequest.match(/(?:like|similar to|based on|matching|same as)\s+['"]?([\w-]+)['"]?/i);
  const likeTarget = likeMatch ? `sections/${likeMatch[1].replace(/\.liquid$/, '')}.liquid` : null;

  const sections = allFiles.filter(f =>
    f.fileName.startsWith('sections/') &&
    f.fileName.endsWith('.liquid') &&
    f.fileName !== activeFilePath
  );

  const results: FileContext[] = [];
  if (likeTarget) {
    const match = sections.find(f => f.fileName === likeTarget);
    if (match) results.push(match);
  }

  const fileEntries = flattenFileTree(fileTree);
  const ranked = sections
    .filter(f => !results.includes(f))
    .sort((a, b) => {
      const aCount = fileEntries.get(a.fileName)?.usedBy?.length ?? 0;
      const bCount = fileEntries.get(b.fileName)?.usedBy?.length ?? 0;
      return bCount - aCount;
    });

  for (const s of ranked) {
    if (results.length >= maxRefs) break;
    results.push(s);
  }

  return results;
}

export function flattenFileTree(tree: ShopifyFileTree | null): Map<string, ShopifyFileTreeEntry> {
  const map = new Map<string, ShopifyFileTreeEntry>();
  if (!tree) return map;
  for (const dir of Object.values(tree.directories)) {
    for (const entry of dir.files) {
      map.set(entry.path, entry);
    }
  }
  return map;
}

export function findMainCssFile(allFiles: FileContext[]): FileContext | null {
  const themeLayout = allFiles.find(f => f.fileName === 'layout/theme.liquid');
  if (themeLayout?.content) {
    const cssMatch = themeLayout.content.match(/\{\{\s*'([^']+\.css)'\s*\|\s*asset_url/);
    if (cssMatch) {
      const cssName = `assets/${cssMatch[1]}`;
      const found = allFiles.find(f => f.fileName === cssName);
      if (found) return found;
    }
  }

  const candidates = ['assets/base.css', 'assets/theme.css', 'assets/main.css', 'assets/styles.css'];
  for (const name of candidates) {
    const found = allFiles.find(f => f.fileName === name);
    if (found) return found;
  }

  let largest: FileContext | null = null;
  let largestSize = 0;
  for (const f of allFiles) {
    if (f.fileName.startsWith('assets/') && f.fileName.endsWith('.css')) {
      const size = f.content?.length ?? 0;
      if (size > largestSize) {
        largest = f;
        largestSize = size;
      }
    }
  }
  return largest;
}

export function findSnippetConsumers(
  snippetPath: string,
  allFiles: FileContext[],
  maxConsumers: number = 3,
): FileContext[] {
  const snippetName = snippetPath.replace(/^snippets\//, '').replace(/\.liquid$/, '');
  const renderRe = new RegExp(`\\{%[-\\s]*(?:render|include)\\s+'${snippetName}'`, 'i');
  const consumers: FileContext[] = [];
  for (const f of allFiles) {
    if (consumers.length >= maxConsumers) break;
    if (!f.content || !f.fileName.startsWith('sections/')) continue;
    if (renderRe.test(f.content)) {
      consumers.push(f);
    }
  }
  return consumers;
}

// ── Scout location index formatter ──────────────────────────────────────────

export function formatScoutLocationIndex(brief: ScoutBrief): string {
  const lines: string[] = ['SCOUT LOCATION INDEX (paths + line ranges only)'];
  const keyFiles = brief.keyFiles.slice(0, 12);
  for (const file of keyFiles) {
    const ranges = file.targets
      .slice(0, 4)
      .map((t) => `${t.lineRange[0]}-${t.lineRange[1]}${t.context ? ` (${t.context})` : ''}`)
      .join(', ');
    lines.push(`- ${file.path} [${file.type}]${ranges ? ` -> ${ranges}` : ''}`);
  }
  if (brief.suggestedEditOrder.length > 0) {
    lines.push('');
    lines.push(`Suggested edit order: ${brief.suggestedEditOrder.slice(0, 12).join(' -> ')}`);
  }
  return lines.join('\n');
}

// ── V2 Context Builder ──────────────────────────────────────────────────────

export interface V2Context {
  preloaded: FileContext[];
  allFiles: FileContext[];
  manifest: string;
  graph?: ThemeDependencyGraph;
  symbolMatchedFiles: string[];
}

export interface BuildContextOptions {
  loadContent?: LoadContentFn;
  activeFilePath?: string;
  openTabs?: string[];
  recentMessages?: string[];
  maxQuality?: boolean;
  strategy?: ExecutionStrategy;
}

const symbolGraphCache = new SymbolGraphCache();

export async function buildV2Context(
  projectId: string,
  files: FileContext[],
  userRequest: string,
  options: BuildContextOptions,
  tier: RoutingTier = 'SIMPLE',
  strategy: ExecutionStrategy = 'HYBRID',
  slim = false,
  onProgress?: (event: { type: string; [key: string]: unknown }) => void,
): Promise<V2Context> {
  const promptMentionedFiles = extractPromptMentionedFiles(userRequest, files);

  if (tier === 'TRIVIAL' && promptMentionedFiles.length > 0) {
    let preloaded = promptMentionedFiles;
    if (options.loadContent && preloaded.length > 0) {
      const idsToHydrate = preloaded.filter(f => !f.content || f.content.startsWith('[')).map(f => f.fileId);
      if (idsToHydrate.length > 0) {
        const hydrated = await options.loadContent(idsToHydrate);
        const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
      }
    }
    for (const f of preloaded) {
      if (f.content && !f.content.startsWith('[')) {
        onProgress?.({
          type: 'context_file_loaded',
          path: f.fileName || f.path || f.fileId,
          tokenCount: Math.ceil((f.content?.length ?? 0) / 4),
        });
      }
    }
    const manifest = files.length + ' files in project (trivial edit — context skipped)';
    return { preloaded, allFiles: files, manifest, symbolMatchedFiles: [] };
  }

  if (slim) {
    const slimStart = Date.now();
    let preloaded: FileContext[] = [];
    const addedIds = new Set<string>();

    if (options.activeFilePath) {
      const active = files.find(f => f.path === options.activeFilePath || f.fileName === options.activeFilePath);
      if (active && !addedIds.has(active.fileId)) {
        preloaded.push(active);
        addedIds.add(active.fileId);
      }
    }

    for (const pmf of promptMentionedFiles) {
      if (!addedIds.has(pmf.fileId)) {
        preloaded.push(pmf);
        addedIds.add(pmf.fileId);
      }
    }

    const renderRefPattern = /\{%[-\s]*(?:render|include|section)\s+['"]([^'"]+)['"]/g;
    const assetRefPattern = /['"]([^'"]+\.(?:js|css|liquid))['"]\s*\|\s*asset_url/g;
    const filesByName = new Map(files.map(f => [f.fileName, f]));
    const filesByPath = new Map(files.filter(f => f.path).map(f => [f.path!, f]));
    const resolveRef = (ref: string): FileContext | undefined =>
      filesByName.get(ref) ?? filesByPath.get(ref)
      ?? files.find(f => f.fileName.endsWith('/' + ref) || f.path?.endsWith('/' + ref));

    const seedFiles = [...preloaded];
    for (const file of seedFiles) {
      if (!file.content || file.content.startsWith('[')) continue;
      for (const pattern of [renderRefPattern, assetRefPattern]) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(file.content)) !== null) {
          const ref = m[1];
          const variants = [ref, `snippets/${ref}`, `snippets/${ref}.liquid`, `sections/${ref}.liquid`, `assets/${ref}`];
          for (const v of variants) {
            const dep = resolveRef(v);
            if (dep && !addedIds.has(dep.fileId)) {
              preloaded.push(dep);
              addedIds.add(dep.fileId);
              break;
            }
          }
        }
      }
      if (preloaded.length >= 20) break;
    }

    preloaded = preloaded.slice(0, 20);

    if (options.loadContent && preloaded.length > 0) {
      const idsToHydrate = preloaded.filter(f => !f.content || f.content.startsWith('[')).map(f => f.fileId);
      if (idsToHydrate.length > 0) {
        const hydrated = await options.loadContent(idsToHydrate);
        const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
      }
    }

    for (const f of preloaded) {
      if (f.content && !f.content.startsWith('[')) {
        onProgress?.({
          type: 'context_file_loaded',
          path: f.fileName || f.path || f.fileId,
          tokenCount: Math.ceil((f.content?.length ?? 0) / 4),
        });
      }
    }
    const activeLabel = options.activeFilePath?.split('/').pop() ?? 'unknown';
    const manifest = `${files.length} files in project (slim context — active: ${activeLabel})`;
    console.log(`[SlimCtx] Built in ${Date.now() - slimStart}ms: ${preloaded.length} files (active + ${preloaded.length - 1} deps)`);
    return { preloaded, allFiles: files, manifest, symbolMatchedFiles: [] };
  }

  const contextEngine = getProjectContextEngine(projectId);
  const indexStart = Date.now();
  await contextEngine.indexFiles(files);
  recordHistogram('agent.context_index_ms', Date.now() - indexStart).catch(() => {});

  const result = await contextEngine.selectRelevantFilesWithSemantics(
    projectId,
    userRequest,
    options.recentMessages,
    options.activeFilePath,
  );

  let preloaded = result.files;
  const graphMatchedIds: string[] = [];
  let symbolMatchedFileNames: string[] = [];

  try {
    const graphFiles: GraphFileContext[] = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      content: f.content,
      sizeBytes: f.content.length,
      lastModified: new Date(),
      dependencies: { imports: [], exports: [], usedBy: [] },
    }));
    const { graph } = await symbolGraphCache.getOrCompute(projectId, graphFiles);
    const graphLookupLimit = strategy === 'GOD_MODE' ? 30 : tier === 'TRIVIAL' ? 4 : 10;
    const graphMatched = symbolGraphCache.lookupFiles(graph, userRequest, graphLookupLimit);
    symbolMatchedFileNames = graphMatched;
    const preloadedIdsSet = new Set(preloaded.map((f) => f.fileId));
    for (const fileName of graphMatched) {
      const match = files.find((f) => f.fileName === fileName || f.path === fileName);
      if (match && !preloadedIdsSet.has(match.fileId)) {
        preloaded.push(match);
        preloadedIdsSet.add(match.fileId);
      }
      if (match) graphMatchedIds.push(match.fileId);
    }
  } catch {
    // Best-effort only.
  }

  const promptMentionedIds = new Set(promptMentionedFiles.map(f => f.fileId));
  const preloadedIds = new Set(preloaded.map(f => f.fileId));
  for (const pmf of promptMentionedFiles) {
    if (!preloadedIds.has(pmf.fileId)) {
      preloaded.push(pmf);
      preloadedIds.add(pmf.fileId);
    }
  }

  if (strategy === 'GOD_MODE') {
    const filesByName = new Map(files.map(f => [f.fileName, f]));
    const filesByPath = new Map(files.filter(f => f.path).map(f => [f.path!, f]));
    const resolveRef = (ref: string): FileContext | undefined =>
      filesByName.get(ref) ?? filesByPath.get(ref)
      ?? files.find(f => f.fileName.endsWith('/' + ref) || f.path?.endsWith('/' + ref));

    const renderRefPattern = /\{%[-\s]*(?:render|include|section)\s+['"]([^'"]+)['"]/g;
    const assetRefPattern = /['"]([^'"]+\.(?:js|css|liquid))['"]\s*\|\s*asset_url/g;
    const expandedIds = new Set(preloaded.map(f => f.fileId));
    const toExpand = [...preloaded];

    for (const file of toExpand) {
      if (file.content.startsWith('[')) continue;
      for (const pattern of [renderRefPattern, assetRefPattern]) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(file.content)) !== null) {
          const ref = m[1];
          const variants = [ref, `snippets/${ref}`, `snippets/${ref}.liquid`, `sections/${ref}.liquid`, `assets/${ref}`];
          for (const v of variants) {
            const dep = resolveRef(v);
            if (dep && !expandedIds.has(dep.fileId)) {
              preloaded.push(dep);
              expandedIds.add(dep.fileId);
              toExpand.push(dep);
              break;
            }
          }
        }
      }
    }
  }

  const score = new Map<string, number>();
  for (const f of result.files) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 10);
  for (const id of graphMatchedIds) score.set(id, (score.get(id) ?? 0) + 20);
  for (const f of promptMentionedFiles) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 50);
  for (const id of options.openTabs ?? []) score.set(id, (score.get(id) ?? 0) + 30);
  if (options.activeFilePath) {
    const active = files.find((f) => f.path === options.activeFilePath || f.fileName === options.activeFilePath);
    if (active) score.set(active.fileId, (score.get(active.fileId) ?? 0) + 40);
  }
  const preloadedCap = strategy === 'GOD_MODE' ? 60
    : tier === 'ARCHITECTURAL' ? 50
    : tier === 'TRIVIAL' ? 6
    : tier === 'SIMPLE' ? 12
    : 20;

  const guaranteed = preloaded.filter(f => promptMentionedIds.has(f.fileId));
  const rest = [...new Map(preloaded.filter(f => !promptMentionedIds.has(f.fileId)).map(f => [f.fileId, f])).values()]
    .sort((a, b) => (score.get(b.fileId) ?? 0) - (score.get(a.fileId) ?? 0))
    .slice(0, Math.max(0, preloadedCap - guaranteed.length));
  preloaded = [...guaranteed, ...rest];

  if (options.loadContent && preloaded.length > 0) {
    const idsToHydrate = preloaded
      .filter(f => !f.content || f.content.startsWith('['))
      .map(f => f.fileId);

    if (idsToHydrate.length > 0) {
      const hydrated = await options.loadContent(idsToHydrate);
      const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
      preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
    }
  }

  const { ThemeDependencyGraph: GraphClass } = await import('@/lib/context/cross-language-graph');
  const graph = new GraphClass();
  try {
    graph.buildFromFiles(files.map(f => ({
      path: f.path ?? f.fileName,
      content: f.content?.startsWith('[') ? '' : (f.content ?? ''),
    })));
  } catch { /* graph build is best-effort */ }

  const { buildRepoMap } = await import('@/lib/context/repo-map');
  const repoMapTokenBudget = strategy === 'GOD_MODE' ? 12_000
    : tier === 'ARCHITECTURAL' ? 4000 : 2000;
  const manifest = buildRepoMap(files, graph, {
    activeFilePath: options.activeFilePath,
    mentionedFiles: promptMentionedFiles.map(f => f.fileName),
    maxTokens: repoMapTokenBudget,
  });

  for (const f of preloaded) {
    if (f.content && !f.content.startsWith('[')) {
      onProgress?.({
        type: 'context_file_loaded',
        path: f.fileName || f.path || f.fileId,
        tokenCount: Math.ceil((f.content?.length ?? 0) / 4),
      });
    }
  }

  return { preloaded, allFiles: files, manifest, graph, symbolMatchedFiles: symbolMatchedFileNames };
}
