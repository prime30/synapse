-- =============================================================================
-- Migration 040: Background tasks table for EPIC F (task runner)
--
-- Stores scheduled background tasks dispatched by Vercel Cron.
-- Uses optimistic locking (status check) to prevent double-execution.
-- =============================================================================

CREATE TABLE IF NOT EXISTS background_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the dispatch query: find next pending task efficiently
CREATE INDEX IF NOT EXISTS idx_background_tasks_dispatch
  ON background_tasks (status, scheduled_at ASC)
  WHERE status = 'pending';

-- Index for UI: recent task executions
CREATE INDEX IF NOT EXISTS idx_background_tasks_recent
  ON background_tasks (created_at DESC);

-- RLS: only service role accesses this table (from API routes)
ALTER TABLE background_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON background_tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);
