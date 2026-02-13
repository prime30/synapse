-- =============================================================================
-- Migration 026: Developer Memory
-- EPIC 14: Persistent developer memory — conventions, decisions, preferences.
--
-- Stores learned codebase patterns that the AI uses across sessions to maintain
-- consistency with the developer's style and past choices.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create memory type enum
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_type') THEN
    CREATE TYPE public.memory_type AS ENUM ('convention', 'decision', 'preference');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_feedback') THEN
    CREATE TYPE public.memory_feedback AS ENUM ('correct', 'wrong');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create developer_memory table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.developer_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        public.memory_type NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  confidence  FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  feedback    public.memory_feedback,  -- NULL = no feedback yet
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: all memories for a project+user
CREATE INDEX IF NOT EXISTS idx_developer_memory_project_user
  ON public.developer_memory(project_id, user_id);

-- Filter by type
CREATE INDEX IF NOT EXISTS idx_developer_memory_type
  ON public.developer_memory(project_id, type);

-- Filter by confidence for active memory injection
CREATE INDEX IF NOT EXISTS idx_developer_memory_confidence
  ON public.developer_memory(project_id, confidence DESC)
  WHERE feedback IS DISTINCT FROM 'wrong';

-- JSONB content search (GIN index for flexible queries)
CREATE INDEX IF NOT EXISTS idx_developer_memory_content
  ON public.developer_memory USING GIN (content);

-- ---------------------------------------------------------------------------
-- 4. Auto-update updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_developer_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_developer_memory_updated_at ON public.developer_memory;
CREATE TRIGGER trg_developer_memory_updated_at
  BEFORE UPDATE ON public.developer_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_developer_memory_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.developer_memory ENABLE ROW LEVEL SECURITY;

-- Users can view their own memories (via org membership on the project)
CREATE POLICY "Users can view own developer memories"
  ON public.developer_memory FOR SELECT
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own developer memories"
  ON public.developer_memory FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own developer memories"
  ON public.developer_memory FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own developer memories"
  ON public.developer_memory FOR DELETE
  USING (user_id = auth.uid());
