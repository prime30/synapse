-- Add application-level admin flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed the initial admin account
UPDATE public.profiles
  SET is_admin = TRUE
  WHERE email = 'alexmaxday@gmail.com';

-- RLS: only existing admins can promote other users to admin.
-- Regular users cannot set is_admin on themselves or others.
-- The service role key bypasses this (used by the admin invite API).

-- Helper function: check if the current auth user is an admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Policy: users can update their own profile (but NOT the is_admin column).
-- This is enforced at the application level since Supabase RLS cannot
-- restrict individual columns. The API route uses the service role key
-- and validates admin status before allowing is_admin changes.
