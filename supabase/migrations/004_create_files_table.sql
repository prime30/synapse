-- File type enum
CREATE TYPE public.file_type AS ENUM ('liquid', 'javascript', 'css', 'other');

-- Files table with smart storage strategy
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type public.file_type NOT NULL DEFAULT 'other',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content TEXT,                    -- For files <100KB
  storage_path TEXT,               -- For files >=100KB (Supabase Storage)
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, path)
);

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
