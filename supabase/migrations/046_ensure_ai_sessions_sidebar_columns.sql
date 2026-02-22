-- Backfill-safe guard migration for environments that missed 043_ai_sessions_sidebar.sql.
-- Ensures session sidebar columns exist for history/archive queries.

ALTER TABLE public.ai_sessions
  ADD COLUMN IF NOT EXISTS lines_added INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines_deleted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_affected INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_sessions_archived
  ON public.ai_sessions(project_id, user_id, archived_at);
