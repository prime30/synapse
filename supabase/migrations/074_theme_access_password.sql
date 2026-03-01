ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS theme_access_password_encrypted TEXT;
