-- REQ-2: Agent orchestration — agent_executions and user_preferences (learning)
-- Run after 001 (profiles), 003 (projects). Uses update_updated_at from 001.

-- ---------------------------------------------------------------------------
-- User preferences (learning fields for pattern storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  file_type TEXT,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  first_observed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can create preferences" ON public.user_preferences;
CREATE POLICY "Users can create preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete own preferences"
  ON public.user_preferences FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON public.user_preferences(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_preferences_file_type ON public.user_preferences(user_id, file_type);

DROP TRIGGER IF EXISTS user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Agent execution status and table
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.agent_execution_status AS ENUM ('completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own executions"
  ON public.agent_executions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can create executions"
  ON public.agent_executions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own executions"
  ON public.agent_executions FOR UPDATE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_agent_executions_project ON public.agent_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_user ON public.agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_started ON public.agent_executions(started_at DESC);
