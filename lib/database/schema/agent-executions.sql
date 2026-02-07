-- Agent execution status enum
CREATE TYPE public.agent_execution_status AS ENUM ('completed', 'failed');

-- Agent executions table
CREATE TABLE IF NOT EXISTS public.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_request TEXT NOT NULL,
  status public.agent_execution_status NOT NULL,
  execution_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_result JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

-- Users can view their own executions
CREATE POLICY "Users can view own executions"
  ON public.agent_executions FOR SELECT
  USING (user_id = auth.uid());

-- Users can create executions
CREATE POLICY "Users can create executions"
  ON public.agent_executions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own executions
CREATE POLICY "Users can update own executions"
  ON public.agent_executions FOR UPDATE
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_executions_project ON public.agent_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_user ON public.agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_started ON public.agent_executions(started_at DESC);
