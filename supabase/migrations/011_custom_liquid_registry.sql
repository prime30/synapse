-- Create custom Liquid tags and filters registry tables for REQ-6

-- Custom Liquid Tags table
CREATE TABLE IF NOT EXISTS public.custom_liquid_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  signature TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_liquid_tags_project_id ON public.custom_liquid_tags(project_id);

-- Updated_at trigger for custom_liquid_tags
CREATE TRIGGER custom_liquid_tags_updated_at
  BEFORE UPDATE ON public.custom_liquid_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Custom Liquid Filters table
CREATE TABLE IF NOT EXISTS public.custom_liquid_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'any',
  output_type TEXT NOT NULL DEFAULT 'string',
  parameters JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_liquid_filters_project_id ON public.custom_liquid_filters(project_id);

-- Updated_at trigger for custom_liquid_filters
CREATE TRIGGER custom_liquid_filters_updated_at
  BEFORE UPDATE ON public.custom_liquid_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS on both tables
ALTER TABLE public.custom_liquid_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_liquid_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_liquid_tags (same pattern as files table)
CREATE POLICY "Org members can view project custom liquid tags"
  ON public.custom_liquid_tags FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create custom liquid tags"
  ON public.custom_liquid_tags FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update custom liquid tags"
  ON public.custom_liquid_tags FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete custom liquid tags"
  ON public.custom_liquid_tags FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS Policies for custom_liquid_filters (same pattern as files table)
CREATE POLICY "Org members can view project custom liquid filters"
  ON public.custom_liquid_filters FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create custom liquid filters"
  ON public.custom_liquid_filters FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update custom liquid filters"
  ON public.custom_liquid_filters FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete custom liquid filters"
  ON public.custom_liquid_filters FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
