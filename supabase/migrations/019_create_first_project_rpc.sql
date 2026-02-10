-- RPC to create a project (and personal org if needed) without touching
-- organizations/organization_members from the client, avoiding schema-cache issues.
CREATE OR REPLACE FUNCTION public.create_first_project(
  p_name text DEFAULT 'My project',
  p_description text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_project_id uuid;
  v_project_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use first existing org for this user
  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE user_id = v_user_id
  LIMIT 1;

  -- If no org, create personal org (trigger will add user to organization_members)
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES (
      'Personal',
      'personal-' || replace(gen_random_uuid()::text, '-', ''),
      v_user_id
    )
    RETURNING id INTO v_org_id;
  END IF;

  -- Create project
  INSERT INTO public.projects (name, description, organization_id, owner_id)
  VALUES (
    COALESCE(NULLIF(trim(p_name), ''), 'My project'),
    NULLIF(trim(p_description), ''),
    v_org_id,
    v_user_id
  )
  RETURNING id, name INTO v_project_id, v_project_name;

  RETURN json_build_object('id', v_project_id, 'name', v_project_name);
END;
$$;

-- Allow authenticated users to call this
GRANT EXECUTE ON FUNCTION public.create_first_project(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_first_project(text, text) TO service_role;
