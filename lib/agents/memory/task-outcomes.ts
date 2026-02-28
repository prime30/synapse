import type { SupabaseClient } from '@supabase/supabase-js';

export interface TaskOutcome {
  id: string;
  projectId: string;
  userId: string;
  taskSummary: string;
  strategy: string | null;
  outcome: 'success' | 'partial' | 'failure';
  filesChanged: string[];
  toolSequence: string[];
  iterationCount: number;
  tokenUsage: { inputTokens?: number; outputTokens?: number; model?: string };
  userFeedback: 'positive' | 'negative' | null;
  role?: string;
  createdAt: string;
  similarity?: number;
}

export interface StoreOutcomeInput {
  projectId: string;
  userId: string;
  taskSummary: string;
  strategy?: string;
  outcome: 'success' | 'partial' | 'failure';
  filesChanged?: string[];
  toolSequence?: string[];
  iterationCount?: number;
  tokenUsage?: Record<string, unknown>;
  role?: string;
}

export async function storeTaskOutcome(
  supabase: SupabaseClient,
  input: StoreOutcomeInput,
): Promise<string | null> {
  try {
    const summary = input.taskSummary.slice(0, 2000);
    const { data, error } = await supabase
      .from('task_outcomes')
      .insert({
        project_id: input.projectId,
        user_id: input.userId,
        task_summary: summary,
        strategy: input.strategy ?? null,
        outcome: input.outcome,
        files_changed: input.filesChanged ?? [],
        tool_sequence: input.toolSequence ?? [],
        iteration_count: input.iterationCount ?? 0,
        token_usage: input.tokenUsage ?? {},
        role: input.role ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[TaskOutcomes] Failed to store:', error.message);
      return null;
    }

    const outcomeId = data?.id ?? null;

    // Fire-and-forget: generate and store embedding for semantic retrieval
    if (outcomeId) {
      generateAndStoreEmbedding(supabase, outcomeId, summary).catch(() => {});
    }

    return outcomeId;
  } catch {
    return null;
  }
}

async function generateAndStoreEmbedding(
  supabase: SupabaseClient,
  outcomeId: string,
  taskSummary: string,
): Promise<void> {
  try {
    const { generateEmbedding } = await import('@/lib/ai/embeddings');
    const embedding = await generateEmbedding(taskSummary);
    const { error } = await supabase
      .from('task_outcomes')
      .update({ embedding: `[${embedding.join(',')}]` })
      .eq('id', outcomeId);
    if (error) {
      console.warn('[TaskOutcomes] Failed to store embedding:', error.message);
    }
  } catch (err) {
    console.warn('[TaskOutcomes] Embedding generation failed (non-fatal):', String(err));
  }
}

/**
 * Retrieve similar past outcomes using embedding cosine similarity (primary)
 * with keyword ILIKE fallback when embeddings are unavailable.
 * Returns results with similarity scores for quality gating.
 */
export async function retrieveSimilarOutcomes(
  supabase: SupabaseClient,
  projectId: string,
  query: string,
  maxResults = 5,
  similarityThreshold = 0.5,
  options?: { role?: string },
): Promise<TaskOutcome[]> {
  const role = options?.role;
  const semanticResults = await retrieveByEmbedding(supabase, projectId, query, maxResults, similarityThreshold, role);
  if (semanticResults.length > 0) return semanticResults;

  return retrieveByKeyword(supabase, projectId, query, maxResults, role);
}

async function retrieveByEmbedding(
  supabase: SupabaseClient,
  projectId: string,
  query: string,
  maxResults: number,
  similarityThreshold: number,
  role?: string,
): Promise<TaskOutcome[]> {
  try {
    const { generateEmbedding } = await import('@/lib/ai/embeddings');
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('match_task_outcomes', {
      p_project_id: projectId,
      query_embedding: `[${queryEmbedding.join(',')}]`,
      similarity_threshold: similarityThreshold,
      match_count: maxResults,
      p_role: role ?? null,
    });

    if (error || !data || data.length === 0) return [];

    return data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      projectId,
      userId: '',
      taskSummary: row.task_summary as string,
      strategy: row.strategy as string | null,
      outcome: row.outcome as 'success' | 'partial' | 'failure',
      filesChanged: (row.files_changed as string[]) ?? [],
      toolSequence: (row.tool_sequence as string[]) ?? [],
      iterationCount: (row.iteration_count as number) ?? 0,
      tokenUsage: (row.token_usage as TaskOutcome['tokenUsage']) ?? {},
      userFeedback: row.user_feedback as 'positive' | 'negative' | null,
      role: (row.role as string) ?? undefined,
      createdAt: row.created_at as string,
      similarity: row.similarity as number,
    }));
  } catch {
    return [];
  }
}

async function retrieveByKeyword(
  supabase: SupabaseClient,
  projectId: string,
  query: string,
  maxResults: number,
  role?: string,
): Promise<TaskOutcome[]> {
  try {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 6);

    if (keywords.length === 0) return [];

    const ilike = keywords.map(k => `task_summary.ilike.%${k}%`);

    let q = supabase
      .from('task_outcomes')
      .select('*')
      .eq('project_id', projectId)
      .eq('outcome', 'success')
      .or(ilike.join(','))
      .order('created_at', { ascending: false })
      .limit(maxResults);

    if (role) {
      q = q.eq('role', role);
    }

    const { data, error } = await q;

    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => {
      const matchedKeywords = keywords.filter(k =>
        (row.task_summary as string).toLowerCase().includes(k)
      );
      return {
        id: row.id as string,
        projectId: row.project_id as string,
        userId: row.user_id as string,
        taskSummary: row.task_summary as string,
        strategy: row.strategy as string | null,
        outcome: row.outcome as 'success' | 'partial' | 'failure',
        filesChanged: (row.files_changed as string[]) ?? [],
        toolSequence: (row.tool_sequence as string[]) ?? [],
        iterationCount: (row.iteration_count as number) ?? 0,
        tokenUsage: (row.token_usage as TaskOutcome['tokenUsage']) ?? {},
        userFeedback: row.user_feedback as 'positive' | 'negative' | null,
        role: (row.role as string) ?? undefined,
        createdAt: row.created_at as string,
        similarity: matchedKeywords.length / Math.max(keywords.length, 1),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Format outcomes for prompt injection with quality-gated filtering.
 * Applies age decay and similarity threshold before formatting.
 */
export function formatOutcomesForPrompt(
  outcomes: TaskOutcome[],
  options: { similarityThreshold?: number; maxAge?: number; maxResults?: number } = {},
): string {
  const {
    similarityThreshold = 0.7,
    maxAge = 90,
    maxResults = 3,
  } = options;

  const now = Date.now();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const decayRate = 0.05;

  const scored = outcomes
    .map(o => {
      const ageMs = now - new Date(o.createdAt).getTime();
      const ageWeeks = ageMs / msPerWeek;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);

      if (ageDays > maxAge) return null;

      const baseSimilarity = o.similarity ?? 0;
      const decayedScore = baseSimilarity * Math.pow(1 - decayRate, ageWeeks);

      if (decayedScore < similarityThreshold) return null;

      return { outcome: o, score: decayedScore };
    })
    .filter((x): x is { outcome: TaskOutcome; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  if (scored.length === 0) return '';

  const lines = scored.map((s, i) => {
    const o = s.outcome;
    const files = o.filesChanged.length > 0 ? o.filesChanged.join(', ') : 'unknown';
    const tools = o.toolSequence.length > 0 ? o.toolSequence.slice(0, 5).join(' → ') : 'unknown';
    const pct = Math.round(s.score * 100);
    return `${i + 1}. "${o.taskSummary.slice(0, 150)}" (${pct}% match)\n   Strategy: ${o.strategy ?? 'unknown'} | Files: ${files}\n   Tool flow: ${tools} | Iterations: ${o.iterationCount}`;
  });

  return `## I found similar past tasks on this project\n\n${lines.join('\n\n')}\n\nAdapt these proven patterns if relevant — they succeeded before.`;
}
