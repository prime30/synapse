-- Online (user-scoped) OAuth token for draft theme preview.
-- These short-lived tokens (~24h) carry user-level permissions that
-- Shopify requires to honor preview_theme_id on the storefront.

ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS online_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS online_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS online_token_user JSONB;
