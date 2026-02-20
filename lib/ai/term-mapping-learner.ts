/**
 * Term Mapping Learner — Prong 2 of learned term mappings.
 *
 * Learns term-to-file mappings from agent execution signals:
 *   - Query terms extracted from the user's request
 *   - Files the agent searched and read during execution
 *   - Files the agent actually edited
 *
 * Also provides shared utilities for loading and querying stored mappings.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { TermMappingContent } from './theme-term-extractor';

// ── Types ─────────────────────────────────────────────────────────────

export interface ExecutionLearningSignal {
  queryTerms: string[];
  editedFiles: string[];
  searchedFiles: string[];
}

export interface LoadedTermMapping {
  id: string;
  term: string;
  filePaths: string[];
  source: TermMappingContent['source'];
  confidence: number;
  usageCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'have', 'been', 'should',
  'would', 'could', 'when', 'what', 'where', 'which', 'their',
  'about', 'after', 'before', 'between', 'each', 'every', 'into',
  'through', 'during', 'using', 'like', 'also', 'just',
  'only', 'some', 'them', 'than', 'then', 'very', 'well', 'here',
  'there', 'does', 'want', 'need', 'please', 'can', 'will',
]);

const ACTION_VERBS = new Set([
  'fix', 'update', 'change', 'make', 'set', 'add', 'remove',
  'delete', 'check', 'show', 'hide', 'move', 'put', 'get',
  'try', 'look', 'see', 'run', 'test', 'build', 'create',
]);

const STRUCTURAL_TERMS = new Set([
  'section', 'snippet', 'template', 'layout', 'asset', 'block',
  'file', 'code', 'liquid', 'html', 'css', 'javascript',
]);

const MIN_TERM_LENGTH = 3;
const MAX_MAPPINGS_PER_PROJECT = 200;
const CONFIDENCE_DECAY_DAYS = 90;
const CONFIDENCE_DECAY_AMOUNT = 0.1;
const MIN_CONFIDENCE_THRESHOLD = 0.3;
const REINFORCEMENT_INCREMENT = 0.05;
const MAX_CONFIDENCE = 0.95;

// ── Term extraction from user requests ────────────────────────────────

/**
 * Extract meaningful terms from a user request, filtering noise.
 */
export function extractQueryTerms(request: string): string[] {
  return request
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= MIN_TERM_LENGTH &&
        !STOP_WORDS.has(w) &&
        !ACTION_VERBS.has(w) &&
        !STRUCTURAL_TERMS.has(w),
    );
}

// ── Supabase client ───────────────────────────────────────────────────

function adminClient(): ReturnType<typeof createServiceClient> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !serviceKey) throw new Error('Supabase config missing');
  return createServiceClient(url, serviceKey);
}

// ── Learning from execution ───────────────────────────────────────────

/**
 * Learn term-to-file mappings from an agent execution's signals.
 * Called fire-and-forget after execution completes.
 *
 * Confidence assignment:
 *   - Searched AND edited: 0.9
 *   - Only edited (agent knew the file): 0.7
 *   - Searched but not edited: skipped
 */
export async function learnFromExecution(
  projectId: string,
  userId: string,
  signal: ExecutionLearningSignal,
): Promise<void> {
  const { queryTerms, editedFiles, searchedFiles } = signal;

  if (queryTerms.length === 0 || editedFiles.length === 0) return;

  const searchedSet = new Set(searchedFiles);

  // Build term → file pairs with confidence
  const pairs: Array<{ term: string; filePath: string; confidence: number }> = [];

  for (const term of queryTerms) {
    for (const filePath of editedFiles) {
      const wasSearched = searchedSet.has(filePath);
      pairs.push({
        term,
        filePath,
        confidence: wasSearched ? 0.9 : 0.7,
      });
    }
  }

  if (pairs.length === 0) return;

  try {
    const supabase = adminClient();
    const now = new Date().toISOString();

    // Load existing term_mapping entries for this project
    type DevMemoryRow = { id: string; content: unknown; confidence: number };
    const { data: existing } = await supabase
      .from('developer_memory')
      .select('id, content, confidence')
      .eq('project_id', projectId)
      .eq('type', 'convention')
      .filter('content->>kind', 'eq', 'term_mapping')
      .filter('content->>source', 'eq', 'execution');

    const existingByTerm = new Map<string, { id: string; content: TermMappingContent; confidence: number }>();
    for (const row of (existing ?? []) as DevMemoryRow[]) {
      const content = row.content as TermMappingContent;
      existingByTerm.set(content.term, { id: row.id, content, confidence: row.confidence });
    }

    // Group pairs by term
    const termGroups = new Map<string, { filePaths: Set<string>; maxConfidence: number }>();
    for (const pair of pairs) {
      const group = termGroups.get(pair.term);
      if (group) {
        group.filePaths.add(pair.filePath);
        group.maxConfidence = Math.max(group.maxConfidence, pair.confidence);
      } else {
        termGroups.set(pair.term, {
          filePaths: new Set([pair.filePath]),
          maxConfidence: pair.confidence,
        });
      }
    }

    const inserts: Array<Record<string, unknown>> = [];

    for (const [term, group] of termGroups) {
      const ex = existingByTerm.get(term);

      if (ex) {
        // Reinforce existing mapping
        const mergedPaths = new Set([...ex.content.filePaths, ...group.filePaths]);
        const newConfidence = Math.min(ex.confidence + REINFORCEMENT_INCREMENT, MAX_CONFIDENCE);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('developer_memory') as any)
          .update({
            content: {
              ...ex.content,
              filePaths: [...mergedPaths],
              usageCount: (ex.content.usageCount ?? 0) + 1,
              lastUsed: now,
            },
            confidence: newConfidence,
          })
          .eq('id', ex.id);
      } else {
        inserts.push({
          project_id: projectId,
          user_id: userId,
          type: 'convention',
          content: {
            kind: 'term_mapping',
            term,
            filePaths: [...group.filePaths],
            source: 'execution',
            usageCount: 1,
            lastUsed: now,
          } satisfies TermMappingContent,
          confidence: group.maxConfidence,
        });
      }
    }

    // Cap total mappings per project
    if (inserts.length > 0) {
      const totalExisting = (existing?.length ?? 0) + inserts.length;
      const toInsert = totalExisting > MAX_MAPPINGS_PER_PROJECT
        ? inserts.slice(0, Math.max(0, MAX_MAPPINGS_PER_PROJECT - (existing?.length ?? 0)))
        : inserts;

      if (toInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('developer_memory') as any).insert(toInsert);
      }
    }
  } catch (err) {
    console.warn('[term-mapping-learner] Learning failed:', err);
  }
}

// ── Loading mappings for context engine ────────────────────────────────

/**
 * Load all active term mappings for a project.
 * Applies confidence decay for stale entries and cleans up expired ones.
 * Results are cached by the ContextEngine instance.
 */
export async function loadTermMappings(projectId: string): Promise<LoadedTermMapping[]> {
  try {
    const supabase = adminClient();

    const { data, error } = await supabase
      .from('developer_memory')
      .select('id, content, confidence, updated_at')
      .eq('project_id', projectId)
      .eq('type', 'convention')
      .filter('content->>kind', 'eq', 'term_mapping')
      .gte('confidence', MIN_CONFIDENCE_THRESHOLD);

    if (error || !data) return [];

    type LoadRow = { id: string; content: unknown; confidence: number; updated_at: string };
    const now = Date.now();
    const results: LoadedTermMapping[] = [];
    const idsToDelete: string[] = [];

    for (const row of data as LoadRow[]) {
      const content = row.content as TermMappingContent;
      let confidence = row.confidence as number;

      // Confidence decay for stale entries
      const lastUsed = content.lastUsed ? new Date(content.lastUsed).getTime() : new Date(row.updated_at).getTime();
      const daysSinceUse = (now - lastUsed) / (1000 * 60 * 60 * 24);

      if (daysSinceUse > CONFIDENCE_DECAY_DAYS) {
        const decayPeriods = Math.floor(daysSinceUse / CONFIDENCE_DECAY_DAYS);
        confidence -= CONFIDENCE_DECAY_AMOUNT * decayPeriods;
      }

      if (confidence < MIN_CONFIDENCE_THRESHOLD) {
        idsToDelete.push(row.id);
        continue;
      }

      results.push({
        id: row.id,
        term: content.term,
        filePaths: content.filePaths ?? [],
        source: content.source,
        confidence,
        usageCount: content.usageCount ?? 0,
      });
    }

    // Clean up expired entries in the background
    if (idsToDelete.length > 0) {
      void Promise.resolve(
        supabase.from('developer_memory').delete().in('id', idsToDelete)
      ).catch(() => {});
    }

    return results;
  } catch (err) {
    console.warn('[term-mapping-learner] Load failed:', err);
    return [];
  }
}
