-- Add clean_start flag to ai_sessions
-- When true, cross-session memory recall is suppressed for this session.
ALTER TABLE public.ai_sessions
  ADD COLUMN IF NOT EXISTS clean_start BOOLEAN NOT NULL DEFAULT false;
