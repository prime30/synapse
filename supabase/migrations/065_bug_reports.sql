CREATE TABLE IF NOT EXISTS public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  screenshot_url TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'fixed', 'archived')),
  agent_session_id UUID REFERENCES public.ai_sessions(id) ON DELETE SET NULL,
  fixed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fixed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bug_reports_project ON public.bug_reports(project_id, status);
CREATE INDEX idx_bug_reports_user ON public.bug_reports(user_id);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bug reports for their projects"
  ON public.bug_reports FOR SELECT
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create bug reports"
  ON public.bug_reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update bug reports"
  ON public.bug_reports FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    )
  );
