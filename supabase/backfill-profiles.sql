-- Backfill public.profiles for any auth.users that don't have a profile yet.
-- Run this in the Supabase SQL Editor if you get:
--   "insert or update on table organizations violates foreign key constraint organizations_owner_id_fkey"
-- (The app needs every authenticated user to have a row in public.profiles.)

INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
