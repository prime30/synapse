-- Publish requests table for role-based deploy approval workflow
CREATE TABLE IF NOT EXISTS publish_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id BIGINT NOT NULL,           -- Shopify theme ID to publish
  theme_name TEXT NOT NULL,           -- Theme name at time of request
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  note TEXT,                          -- Requester's note/reason
  review_note TEXT,                   -- Reviewer's approval/rejection note
  preflight_score INTEGER,            -- AI pre-flight score (0-100) at time of request
  preflight_passed BOOLEAN,           -- Whether pre-flight passed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_publish_requests_project ON publish_requests(project_id, status);
CREATE INDEX idx_publish_requests_requester ON publish_requests(requester_id);

-- RLS
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;

-- Users can read publish requests for projects they belong to
CREATE POLICY "Users can read project publish requests" ON publish_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = publish_requests.project_id AND om.user_id = auth.uid()
    )
  );

-- Users can create publish requests
CREATE POLICY "Users can create publish requests" ON publish_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

-- Admins/owners can update (approve/reject) publish requests
CREATE POLICY "Admins can update publish requests" ON publish_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = publish_requests.project_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Requesters can cancel their own pending requests
CREATE POLICY "Users can delete own pending requests" ON publish_requests
  FOR DELETE USING (requester_id = auth.uid() AND status = 'pending');
