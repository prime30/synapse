-- Dev Store Proxy Preview
-- Adds support for a secondary Shopify dev store per project,
-- used for pixel-accurate native Liquid rendering in the iframe.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS preview_connection_id UUID REFERENCES shopify_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preview_store_theme_id TEXT,
  ADD COLUMN IF NOT EXISTS last_dev_store_push_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_preview_connection
  ON projects (preview_connection_id)
  WHERE preview_connection_id IS NOT NULL;
