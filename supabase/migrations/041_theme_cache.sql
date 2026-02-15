-- Theme-level cache for Liquid AST and other parsed content
CREATE TABLE IF NOT EXISTS public.theme_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_theme_cache_project_key
  ON public.theme_cache (project_id, cache_key);
