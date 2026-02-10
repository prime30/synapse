-- REQ-52: Design System Analysis & Token Management — data model
-- Tables: design_tokens, design_token_usages, design_components, design_system_versions

-- ---------------------------------------------------------------------------
-- design_tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('color', 'typography', 'spacing', 'shadow', 'border', 'animation')),
  value TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  description TEXT,
  metadata JSONB DEFAULT '{}',
  semantic_parent_id UUID REFERENCES public.design_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

CREATE TRIGGER design_tokens_updated_at
  BEFORE UPDATE ON public.design_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- design_token_usages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_token_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.design_tokens(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL DEFAULT 0,
  context TEXT,
  component_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- design_components
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN ('snippet', 'section', 'css_class', 'js_component')),
  tokens_used UUID[] DEFAULT '{}',
  variants TEXT[] DEFAULT '{}',
  usage_frequency INTEGER DEFAULT 0,
  preview_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER design_components_updated_at
  BEFORE UPDATE ON public.design_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- design_system_versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_system_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changes JSONB DEFAULT '{}',
  author_id UUID REFERENCES public.profiles(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- design_tokens
CREATE INDEX idx_design_tokens_project ON public.design_tokens(project_id);
CREATE INDEX idx_design_tokens_category ON public.design_tokens(category);

-- design_token_usages
CREATE INDEX idx_design_token_usages_token ON public.design_token_usages(token_id);
CREATE INDEX idx_design_token_usages_file ON public.design_token_usages(file_path);
CREATE INDEX idx_design_token_usages_token_file ON public.design_token_usages(token_id, file_path);

-- design_components
CREATE INDEX idx_design_components_project ON public.design_components(project_id);

-- design_system_versions
CREATE INDEX idx_design_system_versions_project ON public.design_system_versions(project_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.design_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_token_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_system_versions ENABLE ROW LEVEL SECURITY;

-- Helper subquery: project IDs accessible by the current user (org membership)
-- Reused in every policy below.

-- design_tokens policies
CREATE POLICY "Org members can view design tokens"
  ON public.design_tokens FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create design tokens"
  ON public.design_tokens FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update design tokens"
  ON public.design_tokens FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete design tokens"
  ON public.design_tokens FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- design_token_usages policies (access through token → project)
CREATE POLICY "Org members can view token usages"
  ON public.design_token_usages FOR SELECT
  USING (
    token_id IN (
      SELECT dt.id FROM public.design_tokens dt
      JOIN public.projects p ON p.id = dt.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create token usages"
  ON public.design_token_usages FOR INSERT
  WITH CHECK (
    token_id IN (
      SELECT dt.id FROM public.design_tokens dt
      JOIN public.projects p ON p.id = dt.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update token usages"
  ON public.design_token_usages FOR UPDATE
  USING (
    token_id IN (
      SELECT dt.id FROM public.design_tokens dt
      JOIN public.projects p ON p.id = dt.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete token usages"
  ON public.design_token_usages FOR DELETE
  USING (
    token_id IN (
      SELECT dt.id FROM public.design_tokens dt
      JOIN public.projects p ON p.id = dt.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- design_components policies
CREATE POLICY "Org members can view design components"
  ON public.design_components FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create design components"
  ON public.design_components FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update design components"
  ON public.design_components FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete design components"
  ON public.design_components FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- design_system_versions policies
CREATE POLICY "Org members can view design system versions"
  ON public.design_system_versions FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create design system versions"
  ON public.design_system_versions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update design system versions"
  ON public.design_system_versions FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete design system versions"
  ON public.design_system_versions FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
