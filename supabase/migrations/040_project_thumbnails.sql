-- Add thumbnail_url column to projects for home modal preview cards
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
