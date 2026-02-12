-- =============================================================================
-- Migration 028: Code Comments
-- Inline editor comments with threaded replies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. code_comments table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS code_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES code_comments(id) ON DELETE CASCADE, -- NULL for top-level, set for replies
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes for efficient querying
-- ---------------------------------------------------------------------------

CREATE INDEX idx_code_comments_project_file ON code_comments(project_id, file_path);
CREATE INDEX idx_code_comments_parent ON code_comments(parent_id) WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE code_comments ENABLE ROW LEVEL SECURITY;

-- Users can read comments on projects they have access to
CREATE POLICY "Users can read project comments" ON code_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = code_comments.project_id AND om.user_id = auth.uid()
    )
  );

-- Users can insert their own comments
CREATE POLICY "Users can create comments" ON code_comments
  FOR INSERT WITH CHECK (author_id = auth.uid());

-- Users can update their own comments
CREATE POLICY "Users can update own comments" ON code_comments
  FOR UPDATE USING (author_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments" ON code_comments
  FOR DELETE USING (author_id = auth.uid());
