-- =============================================================================
-- Migration 039: Fix organization_members RLS infinite recursion
--
-- The SELECT/INSERT/DELETE policies on organization_members reference the table
-- itself in their USING/WITH CHECK subqueries, causing PostgreSQL error 42P17
-- (infinite recursion detected in policy for relation "organization_members").
--
-- Fix: create a SECURITY DEFINER helper function that retrieves the current
-- user's organization IDs without RLS, then rewrite all three policies to use
-- it.  SECURITY DEFINER functions execute with the privileges of the function
-- owner (typically the migration role / superuser), so the subquery inside the
-- function bypasses RLS entirely, breaking the cycle.
-- =============================================================================

-- 1. Helper function: returns organization IDs the current user belongs to.
--    SECURITY DEFINER + search_path = public to prevent search-path hijacking.
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid();
$$;

-- 2. Drop the recursive policies
DROP POLICY IF EXISTS "Org members can view members"   ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can manage members"   ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can remove members"   ON public.organization_members;

-- 3. Recreate using the helper function (no self-reference, no recursion)
CREATE POLICY "Org members can view members"
  ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT public.get_my_org_ids()));

CREATE POLICY "Org admins can manage members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT public.get_my_org_ids()
    )
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can remove members"
  ON public.organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT public.get_my_org_ids()
    )
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
