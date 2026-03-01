-- Task outcomes: episodic memory for successful agent task patterns
CREATE TABLE IF NOT EXISTS public.task_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_summary TEXT NOT NULL,
  strategy TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'partial', 'failure')),
  files_changed TEXT[] DEFAULT '{}',
  tool_sequence TEXT[] DEFAULT '{}',
  iteration_count INTEGER DEFAULT 0,
  token_usage JSONB DEFAULT '{}',
  user_feedback TEXT CHECK (user_feedback IN ('positive', 'negative') OR user_feedback IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_outcomes_project ON public.task_outcomes(project_id);
CREATE INDEX idx_task_outcomes_project_outcome ON public.task_outcomes(project_id, outcome);
CREATE INDEX idx_task_outcomes_created ON public.task_outcomes(created_at DESC);

ALTER TABLE public.task_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project task outcomes"
  ON public.task_outcomes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert task outcomes"
  ON public.task_outcomes FOR INSERT
  WITH CHECK (true);
