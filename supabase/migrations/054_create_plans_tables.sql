-- Plans table: project-scoped, versioned, with optional session link
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.ai_sessions(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version INT NOT NULL DEFAULT 1,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Plan todos table: lightweight, versioned for CAS
CREATE TABLE IF NOT EXISTS public.plan_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  sort_order INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER plan_todos_updated_at
  BEFORE UPDATE ON public.plan_todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plans_project_id ON public.plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_session_id ON public.plans(session_id);
CREATE INDEX IF NOT EXISTS idx_plans_updated_at ON public.plans(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_todos_plan_id_sort ON public.plan_todos(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_todos_plan_id_status ON public.plan_todos(plan_id, status);

-- RLS: project-membership based
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON public.plans FOR SELECT USING (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY plans_insert ON public.plans FOR INSERT WITH CHECK (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY plans_update ON public.plans FOR UPDATE USING (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY plans_delete ON public.plans FOR DELETE USING (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY plan_todos_select ON public.plan_todos FOR SELECT USING (
  plan_id IN (SELECT id FROM public.plans)
);

CREATE POLICY plan_todos_insert ON public.plan_todos FOR INSERT WITH CHECK (
  plan_id IN (SELECT id FROM public.plans)
);

CREATE POLICY plan_todos_update ON public.plan_todos FOR UPDATE USING (
  plan_id IN (SELECT id FROM public.plans)
);

CREATE POLICY plan_todos_delete ON public.plan_todos FOR DELETE USING (
  plan_id IN (SELECT id FROM public.plans)
);
