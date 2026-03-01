-- =============================================================================
-- Pending Migrations — run this in Supabase SQL Editor
-- All statements use IF NOT EXISTS / CREATE OR REPLACE so they're idempotent.
-- =============================================================================

-- ── 021: Design System Tables ─────────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS public.design_token_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.design_tokens(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL DEFAULT 0,
  context TEXT,
  component_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_design_tokens_project ON public.design_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_design_tokens_category ON public.design_tokens(category);
CREATE INDEX IF NOT EXISTS idx_design_token_usages_token ON public.design_token_usages(token_id);
CREATE INDEX IF NOT EXISTS idx_design_token_usages_file ON public.design_token_usages(file_path);
CREATE INDEX IF NOT EXISTS idx_design_components_project ON public.design_components(project_id);
CREATE INDEX IF NOT EXISTS idx_design_system_versions_project ON public.design_system_versions(project_id);

ALTER TABLE public.design_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_token_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_system_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view design tokens" ON public.design_tokens;
CREATE POLICY "Org members can view design tokens" ON public.design_tokens FOR SELECT
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.organization_members om ON om.organization_id = p.organization_id WHERE om.user_id = auth.uid()));
DROP POLICY IF EXISTS "Org members can create design tokens" ON public.design_tokens;
CREATE POLICY "Org members can create design tokens" ON public.design_tokens FOR INSERT
  WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.organization_members om ON om.organization_id = p.organization_id WHERE om.user_id = auth.uid()));
DROP POLICY IF EXISTS "Org members can update design tokens" ON public.design_tokens;
CREATE POLICY "Org members can update design tokens" ON public.design_tokens FOR UPDATE
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.organization_members om ON om.organization_id = p.organization_id WHERE om.user_id = auth.uid()));
DROP POLICY IF EXISTS "Org members can delete design tokens" ON public.design_tokens;
CREATE POLICY "Org members can delete design tokens" ON public.design_tokens FOR DELETE
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.organization_members om ON om.organization_id = p.organization_id WHERE om.user_id = auth.uid()));

-- ── 026: Developer Memory ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_type') THEN
    CREATE TYPE public.memory_type AS ENUM ('convention', 'decision', 'preference');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_feedback') THEN
    CREATE TYPE public.memory_feedback AS ENUM ('correct', 'wrong');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.developer_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        public.memory_type NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  confidence  FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  feedback    public.memory_feedback,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developer_memory_project_user ON public.developer_memory(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_developer_memory_type ON public.developer_memory(project_id, type);
CREATE INDEX IF NOT EXISTS idx_developer_memory_confidence ON public.developer_memory(project_id, confidence DESC) WHERE feedback IS DISTINCT FROM 'wrong';
CREATE INDEX IF NOT EXISTS idx_developer_memory_content ON public.developer_memory USING GIN (content);

ALTER TABLE public.developer_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own developer memories" ON public.developer_memory;
CREATE POLICY "Users can view own developer memories" ON public.developer_memory FOR SELECT
  USING (user_id = auth.uid() OR project_id IN (SELECT p.id FROM public.projects p JOIN public.organization_members om ON om.organization_id = p.organization_id WHERE om.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can create own developer memories" ON public.developer_memory;
CREATE POLICY "Users can create own developer memories" ON public.developer_memory FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own developer memories" ON public.developer_memory;
CREATE POLICY "Users can update own developer memories" ON public.developer_memory FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own developer memories" ON public.developer_memory;
CREATE POLICY "Users can delete own developer memories" ON public.developer_memory FOR DELETE USING (user_id = auth.uid());

-- ── 030: Usage Records + Billing RPC ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  execution_id UUID,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  is_byok BOOLEAN NOT NULL DEFAULT false,
  is_included BOOLEAN NOT NULL DEFAULT true,
  request_type TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_org_created ON public.usage_records(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_user ON public.usage_records(user_id, created_at);

CREATE TABLE IF NOT EXISTS public.daily_usage_rollups (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  model TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  included_count INTEGER NOT NULL DEFAULT 0,
  overage_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, day, model)
);

CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.check_usage_and_reserve(
  p_org_id UUID,
  p_period_start TIMESTAMPTZ,
  p_included INTEGER,
  p_on_demand BOOLEAN,
  p_limit_cents INTEGER DEFAULT NULL
) RETURNS TABLE(allowed BOOLEAN, is_included BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
  v_cost INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.usage_records
    WHERE organization_id = p_org_id AND created_at >= p_period_start AND NOT is_byok;
  is_included := v_count < p_included;
  current_count := v_count;
  IF v_count < p_included THEN
    allowed := true;
  ELSIF p_on_demand THEN
    SELECT COALESCE(SUM(cost_cents), 0) INTO v_cost FROM public.usage_records
      WHERE organization_id = p_org_id AND created_at >= p_period_start AND NOT usage_records.is_included AND NOT is_byok;
    allowed := p_limit_cents IS NULL OR v_cost < p_limit_cents;
  ELSE
    allowed := false;
  END IF;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_daily_usage_rollup(p_org_id UUID, p_day DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.daily_usage_rollups (organization_id, day, model, request_count, input_tokens, output_tokens, total_cost_cents, included_count, overage_count)
  SELECT organization_id, p_day, model, COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(cost_cents),
    COUNT(*) FILTER (WHERE is_included), COUNT(*) FILTER (WHERE NOT is_included)
  FROM public.usage_records
  WHERE organization_id = p_org_id AND created_at::date = p_day
  GROUP BY organization_id, model
  ON CONFLICT (organization_id, day, model) DO UPDATE SET
    request_count = EXCLUDED.request_count, input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens, total_cost_cents = EXCLUDED.total_cost_cents,
    included_count = EXCLUDED.included_count, overage_count = EXCLUDED.overage_count;
END $$;

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view usage records" ON public.usage_records;
CREATE POLICY "Org members can view usage records" ON public.usage_records FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Org members can view usage rollups" ON public.daily_usage_rollups;
CREATE POLICY "Org members can view usage rollups" ON public.daily_usage_rollups FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- ── 039: Fix organization_members RLS recursion ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "Org members can view members"   ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can manage members"  ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can remove members"  ON public.organization_members;

CREATE POLICY "Org members can view members" ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT public.get_my_org_ids()));

CREATE POLICY "Org admins can manage members" ON public.organization_members FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.get_my_org_ids())
    AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));

CREATE POLICY "Org admins can remove members" ON public.organization_members FOR DELETE
  USING (organization_id IN (SELECT public.get_my_org_ids())
    AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));

-- ── 057: Theme File Tree column on projects ────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_file_tree jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_file_tree_generated_at timestamptz;

-- ── 064: ai_messages.metadata column ──────────────────────────────────────────
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_messages_metadata_tools
  ON public.ai_messages USING GIN (metadata jsonb_path_ops)
  WHERE metadata IS NOT NULL;

-- ── 068: task_outcomes episodic memory ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_summary TEXT NOT NULL,
  strategy TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'partial', 'failure')),
  files_changed TEXT[] DEFAULT '{}',
  tool_sequence TEXT[] DEFAULT '{}',
  iteration_count INTEGER DEFAULT 0,
  token_usage JSONB DEFAULT '{}',
  user_feedback TEXT CHECK (user_feedback IN ('positive', 'negative') OR user_feedback IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_outcomes_project ON public.task_outcomes(project_id);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_project_outcome ON public.task_outcomes(project_id, outcome);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_created ON public.task_outcomes(created_at DESC);

ALTER TABLE public.task_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own project task outcomes" ON public.task_outcomes;
CREATE POLICY "Users can read own project task outcomes" ON public.task_outcomes FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role can insert task outcomes" ON public.task_outcomes;
CREATE POLICY "Service role can insert task outcomes" ON public.task_outcomes FOR INSERT
  WITH CHECK (true);

-- ── 069: task_outcomes embedding + match RPC ──────────────────────────────────
ALTER TABLE public.task_outcomes ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_task_outcomes_embedding ON public.task_outcomes
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.match_task_outcomes(
  p_project_id UUID,
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, task_summary TEXT, strategy TEXT, outcome TEXT,
  files_changed TEXT[], tool_sequence TEXT[], iteration_count INTEGER,
  token_usage JSONB, user_feedback TEXT, role TEXT, created_at TIMESTAMPTZ, similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.task_summary, t.strategy, t.outcome, t.files_changed, t.tool_sequence,
    t.iteration_count, t.token_usage, t.user_feedback, t.role, t.created_at,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.task_outcomes t
  WHERE t.project_id = p_project_id AND t.outcome = 'success' AND t.embedding IS NOT NULL
    AND (p_role IS NULL OR t.role = p_role)
    AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY t.embedding <=> query_embedding LIMIT match_count;
END;
$$;

-- ── 070: role memory columns ────────────────────────────────────────────────
ALTER TABLE public.task_outcomes ADD COLUMN IF NOT EXISTS role TEXT;
CREATE INDEX IF NOT EXISTS idx_task_outcomes_role
  ON public.task_outcomes(project_id, role) WHERE role IS NOT NULL;

ALTER TABLE public.developer_memory ADD COLUMN IF NOT EXISTS source_role TEXT;
CREATE INDEX IF NOT EXISTS idx_developer_memory_source_role
  ON public.developer_memory(project_id, source_role) WHERE source_role IS NOT NULL;
