import type { CodeChange, FileContext } from '@/lib/types/agent';
import { createHash } from 'node:crypto';

export type ThemeTier =
  | 'templates'
  | 'sections'
  | 'snippets'
  | 'assets'
  | 'config_locales'
  | 'other';

const TIER_ORDER: ThemeTier[] = [
  'templates',
  'sections',
  'snippets',
  'assets',
  'config_locales',
  'other',
];

function classifyThemeTier(filePath: string): ThemeTier {
  const p = filePath.replace(/\\/g, '/');
  if (p.startsWith('templates/')) return 'templates';
  if (p.startsWith('sections/')) return 'sections';
  if (p.startsWith('snippets/')) return 'snippets';
  if (p.startsWith('assets/')) return 'assets';
  if (p.startsWith('config/') || p.startsWith('locales/')) return 'config_locales';
  return 'other';
}

export interface ThemePlanRow {
  filePath: string;
  tier: ThemeTier;
  changeType: 'edit' | 'create';
  intent: string;
  batch: number;
}

export interface ThemePlanArtifact {
  rows: ThemePlanRow[];
  dependencyMap: Record<ThemeTier, string[]>;
  batches: Array<{ batch: number; files: string[] }>;
  dependencyEdges: Array<{ from: string; to: string; type: 'render' | 'template_section' | 'asset' }>;
  impactedFiles: string[];
  policyIssues: string[];
  markdown: string;
}

interface CachedDependencyAnalysis {
  dependencyEdges: Array<{ from: string; to: string; type: 'render' | 'template_section' | 'asset' }>;
  impactedFiles: string[];
}

const DEP_ANALYSIS_TTL_MS = 120_000;
const DEP_ANALYSIS_MAX_ENTRIES = 20;
const depAnalysisCache = new Map<string, { expiresAt: number; value: CachedDependencyAnalysis }>();

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\//, '');
}

type EdgeType = 'render' | 'template_section' | 'asset';

function buildThemeEdges(
  mergedContentByPath: Map<string, string>,
  existingPaths: Set<string>
): Array<{ from: string; to: string; type: EdgeType }> {
  const edges: Array<{ from: string; to: string; type: EdgeType }> = [];

  for (const [rawPath, content] of mergedContentByPath) {
    const from = normalizePath(rawPath);

    if (from.endsWith('.liquid')) {
      const renderRegex = /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g;
      let renderMatch: RegExpExecArray | null;
      while ((renderMatch = renderRegex.exec(content)) !== null) {
        const snippetName = renderMatch[1];
        const snippetPath = normalizePath(
          snippetName.endsWith('.liquid') ? `snippets/${snippetName}` : `snippets/${snippetName}.liquid`
        );
        if (existingPaths.has(snippetPath)) {
          edges.push({ from, to: snippetPath, type: 'render' });
        }
      }

      const assetRegex = /\{\{-?\s*['"]([^'"]+)['"]\s*\|\s*(?:asset_url|asset_img_url)/g;
      let assetMatch: RegExpExecArray | null;
      while ((assetMatch = assetRegex.exec(content)) !== null) {
        const assetName = assetMatch[1];
        const assetPath = normalizePath(assetName.startsWith('assets/') ? assetName : `assets/${assetName}`);
        if (existingPaths.has(assetPath)) {
          edges.push({ from, to: assetPath, type: 'asset' });
        }
      }
    }

    if (from.startsWith('templates/') && from.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content) as { sections?: Record<string, { type?: string }> };
        const sections = parsed.sections ?? {};
        for (const section of Object.values(sections)) {
          const type = section?.type;
          if (!type) continue;
          const sectionPath = normalizePath(type.endsWith('.liquid') ? `sections/${type}` : `sections/${type}.liquid`);
          if (existingPaths.has(sectionPath)) {
            edges.push({ from, to: sectionPath, type: 'template_section' });
          }
        }
      } catch {
        // ignore invalid template JSON here; other validators handle it
      }
    }
  }

  return edges;
}

function buildReverseAdjacency(
  edges: Array<{ from: string; to: string; type: EdgeType }>
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = reverse.get(edge.to) ?? new Set<string>();
    set.add(edge.from);
    reverse.set(edge.to, set);
  }
  return reverse;
}

function expandImpactedFiles(touched: Set<string>, reverseAdjacency: Map<string, Set<string>>, maxDepth = 2): Set<string> {
  const impacted = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [];
  for (const t of touched) queue.push({ path: t, depth: 0 });

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (next.depth >= maxDepth) continue;
    const dependents = reverseAdjacency.get(next.path);
    if (!dependents) continue;
    for (const dep of dependents) {
      if (!impacted.has(dep) && !touched.has(dep)) {
        impacted.add(dep);
      }
      queue.push({ path: dep, depth: next.depth + 1 });
    }
  }

  return impacted;
}

function pruneDependencyCache(): void {
  const now = Date.now();
  for (const [k, v] of depAnalysisCache.entries()) {
    if (v.expiresAt <= now) depAnalysisCache.delete(k);
  }
  if (depAnalysisCache.size <= DEP_ANALYSIS_MAX_ENTRIES) return;
  const ordered = [...depAnalysisCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < ordered.length - DEP_ANALYSIS_MAX_ENTRIES; i++) {
    depAnalysisCache.delete(ordered[i][0]);
  }
}

function buildDependencyCacheKey(
  mergedContentByPath: Map<string, string>,
  touched: Set<string>
): string {
  const hash = createHash('sha1');
  const entries = [...mergedContentByPath.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [path, content] of entries) {
    hash.update(path);
    hash.update(':');
    hash.update(String(content.length));
    hash.update(':');
    hash.update(content.slice(0, 80));
    hash.update(':');
    hash.update(content.slice(-80));
    hash.update('|');
  }
  const touchedSorted = [...touched].sort();
  for (const t of touchedSorted) {
    hash.update(`touch:${t}|`);
  }
  return hash.digest('hex');
}

export function buildThemePlanArtifact(
  changes: CodeChange[],
  allFiles: FileContext[],
  readFiles: Set<string>,
  searchedFiles: Set<string>
): ThemePlanArtifact {
  const existingPaths = new Set(
    allFiles.map((f) => normalizePath(f.path ?? f.fileName))
  );
  const mergedContentByPath = new Map<string, string>();
  const changeByPath = new Map<string, CodeChange>();
  for (const c of changes) {
    changeByPath.set(normalizePath(c.fileName), c);
  }
  for (const f of allFiles) {
    const p = normalizePath(f.path ?? f.fileName);
    mergedContentByPath.set(p, changeByPath.get(p)?.proposedContent ?? f.content);
  }
  for (const c of changes) {
    const p = normalizePath(c.fileName);
    if (!mergedContentByPath.has(p)) {
      mergedContentByPath.set(p, c.proposedContent);
    }
  }

  const dedup = new Map<string, ThemePlanRow>();
  const sorted = [...changes].sort((a, b) => {
    const ta = TIER_ORDER.indexOf(classifyThemeTier(a.fileName));
    const tb = TIER_ORDER.indexOf(classifyThemeTier(b.fileName));
    if (ta !== tb) return ta - tb;
    return a.fileName.localeCompare(b.fileName);
  });

  let batch = 1;
  let inBatch = 0;
  for (const c of sorted) {
    const filePath = normalizePath(c.fileName);
    const tier = classifyThemeTier(filePath);
    const key = filePath;
    if (dedup.has(key)) continue;
    if (inBatch >= 5) {
      batch += 1;
      inBatch = 0;
    }
    const inferredType: 'edit' | 'create' = existingPaths.has(filePath) ? 'edit' : 'create';
    dedup.set(key, {
      filePath,
      tier,
      changeType: inferredType,
      intent: c.reasoning?.trim() || 'No explicit intent provided',
      batch,
    });
    inBatch += 1;
  }

  const rows = [...dedup.values()];
  const dependencyMap: Record<ThemeTier, string[]> = {
    templates: [],
    sections: [],
    snippets: [],
    assets: [],
    config_locales: [],
    other: [],
  };
  for (const row of rows) dependencyMap[row.tier].push(row.filePath);

  const batchesMap = new Map<number, string[]>();
  for (const row of rows) {
    const b = batchesMap.get(row.batch) ?? [];
    b.push(row.filePath);
    batchesMap.set(row.batch, b);
  }
  const batches = [...batchesMap.entries()].map(([num, files]) => ({ batch: num, files }));

  const policyIssues: string[] = [];
  for (const b of batches) {
    if (b.files.length > 5) {
      policyIssues.push(`Batch ${b.batch} exceeds max size (5): ${b.files.length}`);
    }
  }
  if (rows.length > 0) {
    const touched = new Set(rows.map((r) => r.filePath));
    const coverageHits = [...readFiles, ...searchedFiles].filter((f) =>
      [...touched].some((t) => t === f || t.endsWith(`/${f}`) || f.endsWith(`/${t}`))
    );
    if (coverageHits.length === 0) {
      policyIssues.push('No touched files were observed in read/search context; possible out-of-context edits.');
    }

    pruneDependencyCache();
    const depKey = buildDependencyCacheKey(mergedContentByPath, touched);
    const cached = depAnalysisCache.get(depKey);
    let dependencyEdges: CachedDependencyAnalysis['dependencyEdges'];
    let impactedFiles: string[];
    if (cached && cached.expiresAt > Date.now()) {
      dependencyEdges = cached.value.dependencyEdges;
      impactedFiles = cached.value.impactedFiles;
    } else {
      dependencyEdges = buildThemeEdges(mergedContentByPath, existingPaths);
      const reverseAdjacency = buildReverseAdjacency(dependencyEdges);
      impactedFiles = [...expandImpactedFiles(touched, reverseAdjacency, 2)]
        .filter((p) => p.startsWith('templates/') || p.startsWith('sections/') || p.startsWith('snippets/') || p.startsWith('assets/'))
        .slice(0, 20);
      depAnalysisCache.set(depKey, {
        expiresAt: Date.now() + DEP_ANALYSIS_TTL_MS,
        value: { dependencyEdges, impactedFiles },
      });
    }

    if (impactedFiles.length > 0) {
      const observed = new Set(
        [...readFiles, ...searchedFiles].map((v) => normalizePath(String(v)))
      );
      const uncovered = impactedFiles.filter((p) => !touched.has(p) && !observed.has(p));
      if (uncovered.length > 0) {
        policyIssues.push(
          `Potential dependent files not reviewed: ${uncovered.slice(0, 6).join(', ')}${uncovered.length > 6 ? ` (+${uncovered.length - 6} more)` : ''}`
        );
      }
    }

    const md = [
      '## Theme-wide Plan Artifact',
      '',
      '### Dependency Map',
      ...TIER_ORDER.map((tier) =>
        `- ${tier}: ${dependencyMap[tier].length > 0 ? dependencyMap[tier].join(', ') : '(none)'}`
      ),
      '',
      '### Touched File Matrix',
      '| File | Tier | Change | Intent | Batch |',
      '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.filePath} | ${r.tier} | ${r.changeType} | ${r.intent.replace(/\|/g, '\\|')} | ${r.batch} |`),
      '',
      '### Dependency Edges (sample)',
      ...(dependencyEdges.length > 0
        ? dependencyEdges.slice(0, 20).map((e) => `- ${e.from} -> ${e.to} (${e.type})`)
        : ['- (none)']),
      '',
      '### Impact Expansion',
      ...(impactedFiles.length > 0
        ? impactedFiles.map((f) => `- ${f}`)
        : ['- No additional dependent files detected (depth=2).']),
      '',
      '### Batch Plan',
      ...batches.map((b) => `- Batch ${b.batch} (${b.files.length} files): ${b.files.join(', ')}`),
      '',
      '### Policy',
      ...(policyIssues.length > 0 ? policyIssues.map((i) => `- [!] ${i}`) : ['- [ok] Batch sizing and dependency coverage checks passed']),
    ].join('\n');

    return { rows, dependencyMap, batches, dependencyEdges, impactedFiles, policyIssues, markdown: md };
  }
  const md = [
    '## Theme-wide Plan Artifact',
    '',
    '### Dependency Map',
    ...TIER_ORDER.map((tier) =>
      `- ${tier}: ${dependencyMap[tier].length > 0 ? dependencyMap[tier].join(', ') : '(none)'}`
    ),
    '',
    '### Touched File Matrix',
    '| File | Tier | Change | Intent | Batch |',
    '|---|---|---|---|---|',
    '(none)',
    '',
    '### Policy',
    '- [ok] No proposed changes.',
  ].join('\n');

  return {
    rows,
    dependencyMap,
    batches,
    dependencyEdges: [],
    impactedFiles: [],
    policyIssues,
    markdown: md,
  };
}

