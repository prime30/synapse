-- V2-8: Theme Health Monitoring
CREATE TABLE IF NOT EXISTS public.theme_health_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('a11y', 'performance', 'cx_gap', 'full')),
  findings JSONB NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info', 'pass')),
  file_count INTEGER NOT NULL DEFAULT 0,
  scan_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_scans_project ON public.theme_health_scans(project_id, created_at DESC);

-- RLS: org members can view and create scans for their projects
ALTER TABLE public.theme_health_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project health scans"
  ON public.theme_health_scans FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create project health scans"
  ON public.theme_health_scans FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
