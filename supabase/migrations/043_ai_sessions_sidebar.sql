-- Extend ai_sessions for sidebar redesign: diff stats + archive support
ALTER TABLE public.ai_sessions
  ADD COLUMN IF NOT EXISTS lines_added INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines_deleted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_affected INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for efficient archived/active filtering
CREATE INDEX IF NOT EXISTS idx_ai_sessions_archived
  ON public.ai_sessions(project_id, user_id, archived_at);