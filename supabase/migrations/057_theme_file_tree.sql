-- Add theme_file_tree JSONB column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_file_tree jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_file_tree_generated_at timestamptz;
