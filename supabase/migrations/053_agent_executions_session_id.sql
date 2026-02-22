-- Bind each execution record to a specific chat session for deterministic tracing.
ALTER TABLE public.agent_executions
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.ai_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_executions_session_id
ON public.agent_executions(session_id);
