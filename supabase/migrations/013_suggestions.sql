-- Create enums for suggestion system
CREATE TYPE public.suggestion_source AS ENUM ('ai_model', 'static_rule', 'hybrid');
CREATE TYPE public.suggestion_scope AS ENUM ('single_line', 'multi_line', 'multi_file');
CREATE TYPE public.suggestion_status AS ENUM ('pending', 'applied', 'rejected', 'edited', 'undone');

-- Suggestions table
CREATE TABLE IF NOT EXISTS public.suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source public.suggestion_source NOT NULL,
  scope public.suggestion_scope NOT NULL,
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  file_paths JSONB NOT NULL DEFAULT '[]',
  original_code TEXT NOT NULL,
  suggested_code TEXT NOT NULL,
  applied_code TEXT,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON public.suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_project ON public.suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON public.suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON public.suggestions(created_at DESC);

-- Enable RLS
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies: org members can access suggestions for their projects
CREATE POLICY "Org members can view project suggestions"
  ON public.suggestions FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create suggestions"
  ON public.suggestions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update suggestions"
  ON public.suggestions FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete suggestions"
  ON public.suggestions FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER suggestions_updated_at
  BEFORE UPDATE ON public.suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
