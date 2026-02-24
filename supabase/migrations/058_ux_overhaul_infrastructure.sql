-- UX Overhaul Infrastructure
-- Adds feedback on AI messages, project settings, full-text search on messages,
-- theme CX profile on projects, and CX pattern dismissal tracking.

-- -----------------------------------------------------------------------------
-- 1. Feedback columns on ai_messages (thumbs up/down, optional comment)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS feedback_rating TEXT CHECK (feedback_rating IN ('thumbs_up', 'thumbs_down')),
  ADD COLUMN IF NOT EXISTS feedback_comment TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 2. project_settings: keyed by project + category, JSONB for flexible config
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, category)
);

CREATE INDEX IF NOT EXISTS idx_project_settings_project_id ON public.project_settings(project_id);

-- -----------------------------------------------------------------------------
-- 3. Full-text search on ai_messages content
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_ai_messages_content_tsv ON public.ai_messages USING GIN (content_tsv);

-- -----------------------------------------------------------------------------
-- 4. Theme CX profile on projects (JSONB for flexible profile data)
-- -----------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS theme_cx_profile JSONB DEFAULT '{}';

-- -----------------------------------------------------------------------------
-- 5. cx_pattern_dismissed: track dismissed CX patterns per project
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cx_pattern_dismissed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pattern_id TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_cx_pattern_dismissed_project ON public.cx_pattern_dismissed(project_id);

-- -----------------------------------------------------------------------------
-- 6. Trigger: auto-update project_settings.updated_at on row update
-- -----------------------------------------------------------------------------
CREATE TRIGGER project_settings_updated_at
  BEFORE UPDATE ON public.project_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
