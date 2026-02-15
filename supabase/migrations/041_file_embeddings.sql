-- =============================================================================
-- Migration 041: File embeddings table for EPIC A (hybrid memory search)
--
-- Requires the pgvector extension to be enabled in Supabase.
-- Enable it via Supabase Dashboard > Database > Extensions > vector.
-- =============================================================================

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- File embeddings table (one row per chunk)
CREATE TABLE IF NOT EXISTS file_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text TEXT,                            -- first 200 chars for display
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding extensions.vector(1536) NOT NULL, -- text-embedding-3-small dimensions
  model_version TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one embedding per file chunk
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_embeddings_file_chunk
  ON file_embeddings (project_id, file_id, chunk_index);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_file_embeddings_hnsw
  ON file_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS: users can only access embeddings for their own projects
ALTER TABLE file_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project embeddings" ON file_embeddings
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Service role can do everything (for API routes + cron)
CREATE POLICY "Service role full access" ON file_embeddings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function for vector similarity search (called via supabase.rpc)
CREATE OR REPLACE FUNCTION match_file_embeddings(
  p_project_id UUID,
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  file_id UUID,
  file_name TEXT,
  chunk_text TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fe.file_id,
    fe.file_name,
    fe.chunk_text,
    fe.chunk_index,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM file_embeddings fe
  WHERE fe.project_id = p_project_id
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
