/**
 * Structural Scout — programmatic brief builder with optional LLM enrichment.
 *
 * Produces a ScoutBrief (file paths, line ranges, semantic relationships) by
 * combining ThemeDependencyGraph, AST chunker, and SymbolGraphCache. The
 * programmatic pass is zero-cost and synchronous; the optional LLM enrichment
 * layer adds semantic descriptions via Grok Code Fast / Sonnet.
 */

import { createHash } from 'node:crypto';
import type { ScoutBrief, ScoutKeyFile, ScoutTarget } from '@/lib/types/agent';
import type { FileContext } from '@/lib/types/agent';
import type { ThemeDependencyGraph } from '@/lib/context/cross-language-graph';
import { chunkFile, type ASTChunk } from '@/lib/parsers/ast-chunker';
import { createNamespacedCache } from '@/lib/cache/cache-adapter';
import { resolveModel } from '@/lib/agents/model-router';
import { STRUCTURAL_SCOUT_PROMPT } from '@/lib/agents/prompts';

// ── Request tokenization ────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off',
  'up', 'down', 'about', 'and', 'but', 'or', 'so', 'if', 'this', 'that',
  'these', 'those', 'it', 'its', 'not', 'no', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'same',
  'than', 'too', 'very', 'just', 'because', 'how', 'what', 'which', 'who',
  'where', 'when', 'why', 'make', 'fix', 'add', 'remove', 'change',
  'update', 'modify', 'set', 'get', 'show', 'hide', 'move', 'also',
  'please', 'need', 'want', 'like', 'use', 'using',
]);

function extractRequestTokens(userRequest: string): string[] {
  return userRequest
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

// ── Chunk scoring ───────────────────────────────────────────────────────────

function scoreChunkRelevance(chunk: ASTChunk, requestTokens: string[]): number {
  if (requestTokens.length === 0) return 0;

  const meta = chunk.metadata;
  const metaValues = [
    meta.settingId, meta.settingType, meta.settingLabel,
    meta.functionName, meta.selector, meta.renderTarget,
    meta.nodeType, ...(meta.references ?? []),
  ].filter(Boolean).map(v => v!.toLowerCase());

  const contentLower = chunk.content.toLowerCase();
  let score = 0;

  for (const token of requestTokens) {
    if (metaValues.some(v => v.includes(token))) {
      score += 2;
    } else if (contentLower.includes(token)) {
      score += 1;
    }
  }

  return score;
}

// ── Chunk description ───────────────────────────────────────────────────────

function describeChunk(chunk: ASTChunk): string {
  const meta = chunk.metadata;
  switch (chunk.type) {
    case 'schema_setting':
      return `Schema setting: ${meta.settingId} (${meta.settingType})`;
    case 'schema_block':
      return `Schema block: ${meta.settingId}`;
    case 'schema_preset':
      return `Schema preset: ${meta.settingLabel ?? meta.settingId}`;
    case 'liquid_block':
      return `Liquid ${meta.nodeType ?? 'block'} block`;
    case 'render_call':
      return `Renders snippet: ${meta.renderTarget}`;
    case 'css_rule':
      return `CSS rule: ${meta.selector ?? 'unknown'}`;
    case 'js_function':
      return `JS function: ${meta.functionName ?? 'anonymous'}`;
    case 'code_block':
      return meta.nodeType === 'json_key'
        ? `JSON key: ${meta.settingId}`
        : 'Code block';
    default:
      return chunk.type;
  }
}

// ── File type inference ─────────────────────────────────────────────────────

function inferFileType(filePath: string): ScoutKeyFile['type'] {
  if (filePath.startsWith('sections/')) return 'section';
  if (filePath.startsWith('snippets/')) return 'snippet';
  if (filePath.startsWith('layout/'))   return 'layout';
  if (filePath.startsWith('templates/')) return 'template';
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.js'))  return 'js';
  if (filePath.endsWith('.json')) return 'json';
  return 'snippet';
}

// ── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(brief: ScoutBrief): number {
  let chars = brief.summary.length;
  for (const f of brief.keyFiles) {
    chars += f.path.length + 30;
    for (const t of f.targets) {
      chars += t.description.length + t.context.length + 20;
    }
  }
  for (const r of brief.relationships) chars += r.length;
  for (const r of brief.recommendations) chars += r.length;
  for (const o of brief.suggestedEditOrder) chars += o.length;
  return Math.ceil(chars / 4);
}

// ── Deduplicate overlapping targets ─────────────────────────────────────────

function deduplicateTargets(targets: ScoutTarget[]): ScoutTarget[] {
  if (targets.length <= 1) return targets;

  const sorted = [...targets].sort((a, b) => a.lineRange[0] - b.lineRange[0]);
  const result: ScoutTarget[] = [];

  for (const target of sorted) {
    const prevIdx = result.findIndex(
      r => target.lineRange[0] >= r.lineRange[0] && target.lineRange[1] <= r.lineRange[1],
    );
    if (prevIdx >= 0) {
      // Fully contained — replace the larger range with the more precise inner one
      result[prevIdx] = target;
      continue;
    }
    const containsIdx = result.findIndex(
      r => r.lineRange[0] >= target.lineRange[0] && r.lineRange[1] <= target.lineRange[1],
    );
    if (containsIdx >= 0) {
      // New target fully contains an existing one — keep the existing (more precise)
      continue;
    }
    // Partial overlap — merge
    const overlapIdx = result.findIndex(
      r => target.lineRange[0] <= r.lineRange[1] && target.lineRange[1] >= r.lineRange[0],
    );
    if (overlapIdx >= 0) {
      const r = result[overlapIdx];
      r.lineRange = [
        Math.min(r.lineRange[0], target.lineRange[0]),
        Math.max(r.lineRange[1], target.lineRange[1]),
      ];
      if (target.confidence > r.confidence) {
        r.description = target.description;
        r.context = target.context;
        r.confidence = target.confidence;
      }
      continue;
    }
    result.push(target);
  }

  return result;
}

// ── Programmatic Scout Builder ──────────────────────────────────────────────

/**
 * Build a ScoutBrief using only existing programmatic infrastructure — zero LLM cost.
 *
 * For each preloaded file:
 *  - Run chunkFile() to get AST chunks with line ranges
 *  - Score chunks against the user request (keyword overlap)
 *  - Extract top-scoring chunks as targets
 *  - Pull cross-file edges from the dependency graph
 */
export function buildProgrammaticScoutBrief(
  userRequest: string,
  preloadedFiles: FileContext[],
  graph: ThemeDependencyGraph,
  symbolMatches: string[],
): ScoutBrief {
  const requestTokens = extractRequestTokens(userRequest);
  const keyFiles: ScoutKeyFile[] = [];
  const relationshipSet = new Set<string>();

  const symbolRankMap = new Map<string, number>();
  for (let i = 0; i < symbolMatches.length; i++) {
    symbolRankMap.set(symbolMatches[i], i);
  }

  for (const file of preloadedFiles) {
    const filePath = file.path ?? file.fileName;
    if (file.content.startsWith('[')) continue;

    const chunks = chunkFile(file.content, filePath);
    let targets: ScoutTarget[] = [];

    for (const chunk of chunks) {
      const score = scoreChunkRelevance(chunk, requestTokens);
      if (score > 0) {
        targets.push({
          description: describeChunk(chunk),
          lineRange: [chunk.lineStart, chunk.lineEnd],
          context: chunk.metadata.nodeType ?? chunk.type,
          confidence: Math.min(1.0, score / Math.max(1, requestTokens.length)),
        });
      }
    }

    targets.sort((a, b) => b.confidence - a.confidence);
    targets = deduplicateTargets(targets.slice(0, 10));

    const symbolRank = symbolRankMap.get(filePath);
    const symbolBoost = symbolRank != null
      ? 1.0 - (symbolRank / Math.max(1, symbolMatches.length)) * 0.5
      : 0;
    const targetScore = targets.length > 0
      ? Math.max(...targets.map(t => t.confidence))
      : 0;
    const relevance = Math.min(1.0, Math.max(symbolBoost, targetScore));

    if (targets.length > 0 || symbolRank != null) {
      keyFiles.push({
        path: filePath,
        type: inferFileType(filePath),
        relevance: Math.round(relevance * 100) / 100,
        targets,
      });
    }

    // Cross-file relationships
    const deps = graph.getDependencies(filePath);
    for (const dep of deps) {
      relationshipSet.add(`${filePath} ${dep.type} ${dep.target}`);
    }
    const dependents = graph.getDependents(filePath);
    for (const dep of dependents) {
      relationshipSet.add(`${dep.source} depends on ${filePath}`);
    }
  }

  keyFiles.sort((a, b) => b.relevance - a.relevance);
  const relationships = [...relationshipSet];

  const fileCount = keyFiles.length;
  const topFile = keyFiles[0];
  const summary = topFile
    ? `${fileCount} relevant file${fileCount !== 1 ? 's' : ''} — primary: ${topFile.path} (${topFile.targets.length} target${topFile.targets.length !== 1 ? 's' : ''})`
    : `No high-relevance files identified for: ${userRequest.slice(0, 100)}`;

  const suggestedEditOrder = keyFiles
    .filter(f => f.targets.length > 0)
    .map(f => f.path);

  const brief: ScoutBrief = {
    summary,
    keyFiles,
    relationships,
    recommendations: [],
    suggestedEditOrder,
    source: 'programmatic',
    tokenCount: 0,
  };
  brief.tokenCount = estimateTokens(brief);

  return brief;
}

// ── Enriched Scout (consumes ThemeMap when warm) ─────────────────────────────

/**
 * Build a ScoutBrief that leverages the pre-computed ThemeMap for line ranges,
 * features, and dependencies — avoiding redundant AST chunking and regex
 * extraction. Falls back to programmatic scoring only for data the map lacks.
 */
export function buildEnrichedScoutBrief(
  userRequest: string,
  themeMap: { files: Record<string, import('@/lib/agents/theme-map/types').ThemeMapFile> },
  preloadedFiles: FileContext[],
  graph: ThemeDependencyGraph,
): ScoutBrief {
  const requestTokens = extractRequestTokens(userRequest);
  const keyFiles: ScoutKeyFile[] = [];
  const relationshipSet = new Set<string>();

  for (const [filePath, mapEntry] of Object.entries(themeMap.files)) {
    const targets: ScoutTarget[] = [];

    for (const [featureSlug, feature] of Object.entries(mapEntry.features)) {
      const searchable = [
        feature.description.toLowerCase(),
        ...feature.keywords.map(k => k.toLowerCase()),
        featureSlug.toLowerCase(),
      ];

      let score = 0;
      for (const token of requestTokens) {
        if (searchable.some(s => s.includes(token))) {
          score += 2;
        }
      }

      if (score > 0) {
        targets.push({
          description: feature.description || featureSlug,
          lineRange: feature.lines,
          context: featureSlug,
          confidence: Math.min(1.0, score / Math.max(1, requestTokens.length)),
        });
      }
    }

    targets.sort((a, b) => b.confidence - a.confidence);
    const dedupedTargets = deduplicateTargets(targets.slice(0, 10));

    const pathLower = filePath.toLowerCase();
    const pathBoost = requestTokens.some(t => pathLower.includes(t)) ? 0.3 : 0;
    const purposeBoost = requestTokens.some(t =>
      mapEntry.purpose.toLowerCase().includes(t),
    ) ? 0.2 : 0;
    const targetScore = dedupedTargets.length > 0
      ? Math.max(...dedupedTargets.map(t => t.confidence))
      : 0;
    const relevance = Math.min(1.0, Math.max(targetScore, pathBoost, purposeBoost));

    if (dedupedTargets.length > 0 || relevance > 0) {
      keyFiles.push({
        path: filePath,
        type: inferFileType(filePath),
        relevance: Math.round(relevance * 100) / 100,
        targets: dedupedTargets,
      });
    }

    for (const dep of mapEntry.dependsOn) {
      relationshipSet.add(`${filePath} depends on ${dep}`);
    }
    for (const renderer of mapEntry.renderedBy) {
      relationshipSet.add(`${renderer} renders ${filePath}`);
    }
  }

  // Supplement with graph edges for files not in the theme map
  for (const file of preloadedFiles) {
    const filePath = file.path ?? file.fileName;
    if (themeMap.files[filePath]) continue;
    const deps = graph.getDependencies(filePath);
    for (const dep of deps) {
      relationshipSet.add(`${filePath} ${dep.type} ${dep.target}`);
    }
  }

  keyFiles.sort((a, b) => b.relevance - a.relevance);
  const relationships = [...relationshipSet];

  const fileCount = keyFiles.length;
  const topFile = keyFiles[0];
  const summary = topFile
    ? `${fileCount} relevant file${fileCount !== 1 ? 's' : ''} (enriched from theme map) — primary: ${topFile.path} (${topFile.targets.length} target${topFile.targets.length !== 1 ? 's' : ''})`
    : `No high-relevance files identified for: ${userRequest.slice(0, 100)}`;

  const suggestedEditOrder = keyFiles
    .filter(f => f.targets.length > 0)
    .map(f => f.path);

  const brief: ScoutBrief = {
    summary,
    keyFiles,
    relationships,
    recommendations: [],
    suggestedEditOrder,
    source: 'programmatic',
    tokenCount: 0,
  };
  brief.tokenCount = estimateTokens(brief);

  return brief;
}

// ── Scout Brief Formatter ───────────────────────────────────────────────────

/**
 * Convert a ScoutBrief JSON into a compact, human-readable format optimized
 * for inclusion in PM / God Mode prompts.
 */
export function formatScoutBrief(brief: ScoutBrief): string {
  const lines: string[] = [];
  lines.push(`SCOUT BRIEF (${brief.source} | ${brief.tokenCount} tokens)`);
  lines.push(`Summary: ${brief.summary}`);
  lines.push('');

  if (brief.keyFiles.length > 0) {
    lines.push('KEY FILES:');
    for (const f of brief.keyFiles) {
      lines.push(`  ${f.path} [${f.type}, relevance: ${f.relevance}]`);
      for (const t of f.targets) {
        lines.push(`    → Lines ${t.lineRange[0]}-${t.lineRange[1]}: ${t.context} — ${t.description}${t.confidence < 0.5 ? ' (low confidence)' : ''}`);
      }
    }
    lines.push('');
  }

  if (brief.relationships.length > 0) {
    lines.push('RELATIONSHIPS:');
    for (const r of brief.relationships) {
      lines.push(`  - ${r}`);
    }
    lines.push('');
  }

  if (brief.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS:');
    for (const r of brief.recommendations) {
      lines.push(`  - ${r}`);
    }
    lines.push('');
  }

  if (brief.suggestedEditOrder.length > 0) {
    lines.push('SUGGESTED EDIT ORDER:');
    brief.suggestedEditOrder.forEach((path, i) => {
      lines.push(`  ${i + 1}. ${path}`);
    });
  }

  return lines.join('\n');
}

// ── ScoutBrief JSON validation ──────────────────────────────────────────────

function parseScoutBrief(raw: unknown): ScoutBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.summary !== 'string') return null;
  if (!Array.isArray(obj.keyFiles)) return null;

  for (const kf of obj.keyFiles) {
    if (!kf || typeof kf !== 'object') return null;
    const file = kf as Record<string, unknown>;
    if (typeof file.path !== 'string') return null;
    if (typeof file.relevance !== 'number') return null;
    if (!Array.isArray(file.targets)) return null;
    for (const t of file.targets) {
      if (!t || typeof t !== 'object') return null;
      const target = t as Record<string, unknown>;
      if (typeof target.description !== 'string') return null;
      if (!Array.isArray(target.lineRange) || target.lineRange.length !== 2) return null;
    }
  }

  return {
    summary: String(obj.summary),
    keyFiles: (obj.keyFiles as ScoutKeyFile[]),
    relationships: Array.isArray(obj.relationships) ? (obj.relationships as string[]) : [],
    recommendations: Array.isArray(obj.recommendations) ? (obj.recommendations as string[]) : [],
    suggestedEditOrder: Array.isArray(obj.suggestedEditOrder) ? (obj.suggestedEditOrder as string[]) : [],
    source: 'llm_enriched',
    tokenCount: typeof obj.tokenCount === 'number' ? obj.tokenCount : 0,
  };
}

// ── LLM Enrichment ──────────────────────────────────────────────────────────
//
// enrichScoutBrief (and getCachedScoutBrief / cacheScoutBrief) are intentionally
// not used by the V2 coordinator: theme map lookup and programmatic scout are
// sufficient for context gating and line-range targets. Kept for possible
// future use (e.g. COMPLEX/ARCHITECTURAL tier semantic enrichment).

/**
 * Enrich a programmatic ScoutBrief with semantic depth via Grok Code Fast
 * (or Sonnet fallback). Adds descriptions, cross-file relationships,
 * recommendations, and edit order. On any failure, returns the original brief.
 * Not currently called by the coordinator; see comment above.
 */
export async function enrichScoutBrief(
  brief: ScoutBrief,
  userRequest: string,
  fileExcerpts: Array<{ path: string; excerpt: string }>,
): Promise<ScoutBrief> {
  try {
    const model = resolveModel({ action: 'scout' });
    const provider = await resolveProvider(model);
    if (!provider) return brief;

    const excerptBlock = fileExcerpts
      .map(e => `### ${e.path}\n\`\`\`\n${e.excerpt}\n\`\`\``)
      .join('\n\n');

    const userMsg = [
      `User request: ${userRequest}`,
      '',
      '## Programmatic ScoutBrief',
      '```json',
      JSON.stringify(brief, null, 2),
      '```',
      '',
      '## Relevant File Excerpts',
      excerptBlock,
    ].join('\n');

    const response = await provider.call(model, STRUCTURAL_SCOUT_PROMPT, userMsg);
    if (!response) return brief;

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return brief;

    let jsonStr = jsonMatch[0];
    let obj: unknown;
    try {
      obj = JSON.parse(jsonStr);
    } catch {
      // Repair common LLM JSON errors: trailing commas before ] or }
      jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\x00-\x1f]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : '');
      try {
        obj = JSON.parse(jsonStr);
      } catch (repairErr) {
        console.warn('[Scout] JSON repair failed, using programmatic brief:', repairErr);
        return brief;
      }
    }

    const parsed = parseScoutBrief(obj);
    if (!parsed) {
      console.warn('[Scout] LLM returned invalid ScoutBrief shape, using programmatic brief');
      return brief;
    }

    parsed.tokenCount = estimateTokens(parsed);
    return parsed;
  } catch (err) {
    console.warn('[Scout] LLM enrichment failed, using programmatic brief:', err);
    return brief;
  }
}

/**
 * Resolve a lightweight provider interface for the scout LLM call.
 * Uses the same provider detection as the rest of the system.
 */
async function resolveProvider(model: string): Promise<{
  call: (model: string, system: string, user: string) => Promise<string | null>;
} | null> {
  const { getProviderForModel } = await import('@/lib/agents/model-router');
  const providerName = getProviderForModel(model);

  if (providerName === 'xai' && process.env.XAI_API_KEY) {
    return {
      call: async (m, system, user) => {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: m,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: 4096,
            temperature: 0,
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content ?? null;
      },
    };
  }

  if (providerName === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return {
      call: async (m, system, user) => {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: m,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { content?: Array<{ text?: string }> };
        return data.content?.[0]?.text ?? null;
      },
    };
  }

  return null;
}

// ── Caching ─────────────────────────────────────────────────────────────────

const scoutCache = createNamespacedCache('scout-brief');
const SCOUT_CACHE_TTL_MS = 1_800_000; // 30 minutes

function buildCacheKey(projectId: string, userRequest: string, fileFingerprint: string): string {
  const requestHash = createHash('sha1').update(userRequest).digest('hex').slice(0, 12);
  return `${projectId}:${requestHash}:${fileFingerprint}`;
}

/**
 * Get a cached LLM-enriched ScoutBrief if available.
 * Programmatic briefs are not cached (fast enough to rebuild).
 */
export async function getCachedScoutBrief(
  projectId: string,
  userRequest: string,
  fileFingerprint: string,
): Promise<ScoutBrief | null> {
  const key = buildCacheKey(projectId, userRequest, fileFingerprint);
  const cached = await scoutCache.get<ScoutBrief>(key);
  return cached ?? null;
}

/**
 * Cache an LLM-enriched ScoutBrief.
 */
export async function cacheScoutBrief(
  projectId: string,
  userRequest: string,
  fileFingerprint: string,
  brief: ScoutBrief,
): Promise<void> {
  if (brief.source !== 'llm_enriched') return;
  const key = buildCacheKey(projectId, userRequest, fileFingerprint);
  await scoutCache.set(key, brief, SCOUT_CACHE_TTL_MS);
}
