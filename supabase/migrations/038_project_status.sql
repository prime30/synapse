-- =============================================================================
-- Migration 038: Project Status (active / archived)
--
-- Adds a status column to projects so that themes whose Shopify dev copy has
-- been deleted can be archived. Archived projects are hidden from the default
-- project list but can be restored (Sync Now) or permanently deleted.
-- =============================================================================

-- 1. Add status column with default 'active'
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. Add CHECK constraint (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

-- 3. Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- 4. Update list_user_projects RPC to include status
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
        p.dev_theme_id,
        p.status,
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
