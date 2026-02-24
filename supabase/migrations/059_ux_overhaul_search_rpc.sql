-- RPC for full-text search on ai_messages (conversation search)
-- Used by GET /api/projects/[projectId]/agent-chat/search

CREATE OR REPLACE FUNCTION public.search_ai_messages(
  p_project_id UUID,
  p_search_term TEXT,
  p_session_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  session_id UUID,
  role TEXT,
  content TEXT,
  created_at TIMESTAMPTZ,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.session_id,
    m.role::TEXT,
    m.content,
    m.created_at,
    ts_rank(m.content_tsv, plainto_tsquery('english', coalesce(p_search_term, ''))) AS rank
  FROM public.ai_messages m
  JOIN public.ai_sessions s ON s.id = m.session_id
  WHERE s.project_id = p_project_id
    AND (p_session_id IS NULL OR m.session_id = p_session_id)
    AND m.content_tsv @@ plainto_tsquery('english', coalesce(p_search_term, ''))
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC to get total count for pagination
CREATE OR REPLACE FUNCTION public.count_search_ai_messages(
  p_project_id UUID,
  p_search_term TEXT,
  p_session_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)::BIGINT INTO v_count
  FROM public.ai_messages m
  JOIN public.ai_sessions s ON s.id = m.session_id
  WHERE s.project_id = p_project_id
    AND (p_session_id IS NULL OR m.session_id = p_session_id)
    AND m.content_tsv @@ plainto_tsquery('english', coalesce(p_search_term, ''));
  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
