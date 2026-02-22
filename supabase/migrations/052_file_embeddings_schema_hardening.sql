-- Normalize file_embeddings schema for chunk-level search.
-- Safe on environments that already match the expected schema.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.file_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text TEXT,
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.file_embeddings
  ADD COLUMN IF NOT EXISTS chunk_index INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunk_text TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_embeddings_project_id_file_id_key'
      AND conrelid = 'public.file_embeddings'::regclass
  ) THEN
    ALTER TABLE public.file_embeddings
      DROP CONSTRAINT file_embeddings_project_id_file_id_key;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_embeddings_file_chunk
  ON public.file_embeddings (project_id, file_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_file_embeddings_hnsw
  ON public.file_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE public.file_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'file_embeddings'
      AND policyname = 'Users can read own project embeddings'
  ) THEN
    CREATE POLICY "Users can read own project embeddings" ON public.file_embeddings
      FOR SELECT
      USING (
        project_id IN (
          SELECT p.id
          FROM public.projects p
          JOIN public.organization_members om ON om.organization_id = p.organization_id
          WHERE om.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'file_embeddings'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.file_embeddings
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.match_file_embeddings(
  p_project_id UUID,
  query_embedding vector(1536),
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
  FROM public.file_embeddings fe
  WHERE fe.project_id = p_project_id
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
