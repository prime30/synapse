-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- File embeddings table for semantic search
CREATE TABLE IF NOT EXISTS file_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, file_id)
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_file_embeddings_project ON file_embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_file_embeddings_vector ON file_embeddings USING ivfflat (embedding vector_cosine_ops);

-- RPC function for similarity search
CREATE OR REPLACE FUNCTION match_file_embeddings(
  p_project_id UUID,
  query_embedding vector(1536),
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  file_id UUID,
  file_name TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fe.file_id,
    fe.file_name,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM file_embeddings fe
  WHERE fe.project_id = p_project_id
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
