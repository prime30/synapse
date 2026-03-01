-- Add embedding column to task_outcomes for semantic episodic memory retrieval.
-- Requires pgvector extension (already enabled via migration 041).

ALTER TABLE public.task_outcomes
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_task_outcomes_embedding
  ON public.task_outcomes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RPC for cosine similarity search on task outcomes
CREATE OR REPLACE FUNCTION public.match_task_outcomes(
  p_project_id UUID,
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  task_summary TEXT,
  strategy TEXT,
  outcome TEXT,
  files_changed TEXT[],
  tool_sequence TEXT[],
  iteration_count INTEGER,
  token_usage JSONB,
  user_feedback TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.task_summary,
    t.strategy,
    t.outcome,
    t.files_changed,
    t.tool_sequence,
    t.iteration_count,
    t.token_usage,
    t.user_feedback,
    t.created_at,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.task_outcomes t
  WHERE t.project_id = p_project_id
    AND t.outcome = 'success'
    AND t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
