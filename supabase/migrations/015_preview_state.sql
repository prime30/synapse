CREATE TABLE IF NOT EXISTS public.preview_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_width INTEGER NOT NULL DEFAULT 1440,
  page_type TEXT NOT NULL DEFAULT 'home',
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_preview_states_project ON public.preview_states(project_id);

ALTER TABLE public.preview_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project preview states"
  ON public.preview_states FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create project preview states"
  ON public.preview_states FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update project preview states"
  ON public.preview_states FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete project preview states"
  ON public.preview_states FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE TRIGGER preview_states_updated_at
  BEFORE UPDATE ON public.preview_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
