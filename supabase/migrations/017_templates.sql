CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  variables JSONB DEFAULT '[]'::jsonb,
  content TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON public.templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON public.templates(workspace_id);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view templates"
  ON public.templates FOR SELECT
  USING (workspace_id IS NULL OR auth.uid() IS NOT NULL);

CREATE POLICY "Org members can manage templates"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Org members can update templates"
  ON public.templates FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Org members can delete templates"
  ON public.templates FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
