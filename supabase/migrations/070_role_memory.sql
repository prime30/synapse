-- Add role tagging to task_outcomes and developer_memory for
-- persistent per-specialist memory across sessions.

-- 1. Role column on task_outcomes (nullable — NULL = project-wide)
ALTER TABLE public.task_outcomes
  ADD COLUMN IF NOT EXISTS role TEXT;

CREATE INDEX IF NOT EXISTS idx_task_outcomes_role
  ON public.task_outcomes(project_id, role) WHERE role IS NOT NULL;

-- 2. Source role column on developer_memory (nullable — NULL = project-wide)
ALTER TABLE public.developer_memory
  ADD COLUMN IF NOT EXISTS source_role TEXT;

CREATE INDEX IF NOT EXISTS idx_developer_memory_source_role
  ON public.developer_memory(project_id, source_role) WHERE source_role IS NOT NULL;

-- 3. Update match_task_outcomes RPC to accept optional role filter
CREATE OR REPLACE FUNCTION public.match_task_outcomes(
  p_project_id UUID,
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  p_role TEXT DEFAULT NULL
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
  role TEXT,
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
    t.role,
    t.created_at,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.task_outcomes t
  WHERE t.project_id = p_project_id
    AND t.outcome = 'success'
    AND t.embedding IS NOT NULL
    AND (p_role IS NULL OR t.role = p_role)
    AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
