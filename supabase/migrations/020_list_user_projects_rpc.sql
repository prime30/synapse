-- RPC to list all projects accessible to the current user.
-- Uses SECURITY DEFINER to bypass PostgREST schema-cache issues.
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
