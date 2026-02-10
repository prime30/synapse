-- Theme push history: one row per push to the dev theme for rollback and audit.
-- Snapshot stores file path + content (capped by caller); trigger indicates source.

CREATE TABLE IF NOT EXISTS public.theme_push_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.shopify_connections(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  trigger TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{"files":[]}',
  CONSTRAINT theme_push_history_trigger_check
    CHECK (trigger IN ('manual', 'import', 'auto_save', 'rollback'))
);

CREATE INDEX IF NOT EXISTS idx_theme_push_history_connection_pushed
  ON public.theme_push_history(connection_id, pushed_at DESC);

ALTER TABLE public.theme_push_history ENABLE ROW LEVEL SECURITY;

-- Org members can access push history for their project's connection
CREATE POLICY "Org members can view project push history"
  ON public.theme_push_history FOR SELECT
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert push history"
  ON public.theme_push_history FOR INSERT
  WITH CHECK (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update push history"
  ON public.theme_push_history FOR UPDATE
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete push history"
  ON public.theme_push_history FOR DELETE
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.theme_push_history IS 'Records each push to the dev preview theme for rollback; snapshot capped by application (e.g. 500 files, skip >100KB).';
