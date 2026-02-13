-- =============================================================================
-- Migration 037: Per-project dev theme ID
--
-- Each project gets its own dev_theme_id for preview. Previously the dev theme
-- was stored on shopify_connections.theme_id, shared across all projects using
-- that connection. This caused preview to show the wrong theme when switching
-- between projects.
-- =============================================================================

-- Add dev_theme_id column to projects (the Shopify development theme for preview)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dev_theme_id TEXT;

-- Backfill: copy existing connection.theme_id to projects that have a connection
UPDATE public.projects p
SET dev_theme_id = sc.theme_id
FROM public.shopify_connections sc
WHERE p.shopify_connection_id = sc.id
  AND sc.theme_id IS NOT NULL
  AND p.dev_theme_id IS NULL;

-- Update list_user_projects RPC to include dev_theme_id
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
