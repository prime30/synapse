-- =============================================================================
-- Migration 025: Store-First Architecture
-- Restructure: User > Store > Theme (Project)
--
-- shopify_connections become user-scoped (not project-scoped).
-- Projects become auto-created workspaces, one per imported theme.
-- theme_files gain a project_id for per-project sync tracking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. shopify_connections: add user_id, is_active; make project_id nullable
-- ---------------------------------------------------------------------------

-- Add user_id column (nullable first for backfill)
ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id);

-- Add is_active flag
ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

-- Backfill user_id from the project's owner_id
UPDATE public.shopify_connections sc
SET user_id = p.owner_id
FROM public.projects p
WHERE sc.project_id = p.id
  AND sc.user_id IS NULL;

-- For any orphaned connections (project deleted), try to infer from organization
UPDATE public.shopify_connections sc
SET user_id = (
  SELECT om.user_id
  FROM public.organization_members om
  LIMIT 1
)
WHERE sc.user_id IS NULL;

-- Now make user_id NOT NULL
ALTER TABLE public.shopify_connections
  ALTER COLUMN user_id SET NOT NULL;

-- Make project_id nullable (backward compat during transition)
ALTER TABLE public.shopify_connections
  ALTER COLUMN project_id DROP NOT NULL;

-- Drop old unique constraint and add new one
ALTER TABLE public.shopify_connections
  DROP CONSTRAINT IF EXISTS shopify_connections_project_id_store_domain_key;

-- New unique: one connection per user per store
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_connections_user_store_unique'
  ) THEN
    ALTER TABLE public.shopify_connections
      ADD CONSTRAINT shopify_connections_user_store_unique
      UNIQUE (user_id, store_domain);
  END IF;
END $$;

-- Enforce at most one active store per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_store_per_user
  ON public.shopify_connections(user_id) WHERE is_active = true;

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_shopify_connections_user
  ON public.shopify_connections(user_id);

-- Auto-activate the most recently updated connection per user
UPDATE public.shopify_connections sc
SET is_active = true
WHERE sc.id = (
  SELECT sc2.id
  FROM public.shopify_connections sc2
  WHERE sc2.user_id = sc.user_id
  ORDER BY sc2.updated_at DESC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.shopify_connections sc3
  WHERE sc3.user_id = sc.user_id AND sc3.is_active = true
);

-- ---------------------------------------------------------------------------
-- 2. projects: add shopify_connection_id, shopify_theme_id, shopify_theme_name
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shopify_connection_id UUID REFERENCES public.shopify_connections(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shopify_theme_id TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shopify_theme_name TEXT;

-- Backfill: link existing projects to their shopify connection
UPDATE public.projects p
SET shopify_connection_id = sc.id
FROM public.shopify_connections sc
WHERE sc.project_id = p.id
  AND p.shopify_connection_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_shopify_connection
  ON public.projects(shopify_connection_id);

-- ---------------------------------------------------------------------------
-- 3. theme_files: add project_id for per-project sync tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.theme_files
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Backfill project_id from connection -> project link
UPDATE public.theme_files tf
SET project_id = sc.project_id
FROM public.shopify_connections sc
WHERE tf.connection_id = sc.id
  AND tf.project_id IS NULL
  AND sc.project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_theme_files_project
  ON public.theme_files(project_id);

-- ---------------------------------------------------------------------------
-- 4. Update RLS policies for shopify_connections: user_id based
-- ---------------------------------------------------------------------------

-- Drop old project-based policies
DROP POLICY IF EXISTS "Org members can view project shopify connections" ON public.shopify_connections;
DROP POLICY IF EXISTS "Org members can create shopify connections" ON public.shopify_connections;
DROP POLICY IF EXISTS "Org members can update shopify connections" ON public.shopify_connections;
DROP POLICY IF EXISTS "Org members can delete shopify connections" ON public.shopify_connections;

-- New user-based policies
CREATE POLICY "Users can view own shopify connections"
  ON public.shopify_connections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own shopify connections"
  ON public.shopify_connections FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own shopify connections"
  ON public.shopify_connections FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own shopify connections"
  ON public.shopify_connections FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Update RLS policies for theme_files: allow access by user_id on connection
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members can view project theme files" ON public.theme_files;
DROP POLICY IF EXISTS "Org members can create theme files" ON public.theme_files;
DROP POLICY IF EXISTS "Org members can update theme files" ON public.theme_files;
DROP POLICY IF EXISTS "Org members can delete theme files" ON public.theme_files;

CREATE POLICY "Users can view own theme files"
  ON public.theme_files FOR SELECT
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own theme files"
  ON public.theme_files FOR INSERT
  WITH CHECK (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own theme files"
  ON public.theme_files FOR UPDATE
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own theme files"
  ON public.theme_files FOR DELETE
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Update RLS policies for theme_push_history: user_id based
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members can view project push history" ON public.theme_push_history;
DROP POLICY IF EXISTS "Org members can insert push history" ON public.theme_push_history;
DROP POLICY IF EXISTS "Org members can update push history" ON public.theme_push_history;
DROP POLICY IF EXISTS "Org members can delete push history" ON public.theme_push_history;

CREATE POLICY "Users can view own push history"
  ON public.theme_push_history FOR SELECT
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own push history"
  ON public.theme_push_history FOR INSERT
  WITH CHECK (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own push history"
  ON public.theme_push_history FOR UPDATE
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own push history"
  ON public.theme_push_history FOR DELETE
  USING (
    connection_id IN (
      SELECT id FROM public.shopify_connections WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Update list_user_projects RPC to include new columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_user_projects()
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT row_to_json(t) FROM (
      SELECT
        p.id,
        p.name,
        p.description,
        p.organization_id,
        p.shopify_store_url,
        p.shopify_connection_id,
        p.shopify_theme_id,
        p.shopify_theme_name,
        p.created_at,
        p.updated_at
      FROM public.projects p
      JOIN public.organization_members om
        ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
      ORDER BY p.updated_at DESC
    ) t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_projects() TO service_role;
