-- V2-6: Session Summary Sharing
CREATE TABLE IF NOT EXISTS public.shared_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  sanitized_content TEXT NOT NULL,
  title TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_summaries_token ON public.shared_session_summaries(token);
CREATE INDEX IF NOT EXISTS idx_shared_summaries_expires ON public.shared_session_summaries(expires_at);

-- RLS: public read (security via unguessable token); insert only for session owner
ALTER TABLE public.shared_session_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read by token" ON public.shared_session_summaries
  FOR SELECT USING (true);
CREATE POLICY "Session owner can create share" ON public.shared_session_summaries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );
