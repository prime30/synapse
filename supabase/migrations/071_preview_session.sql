-- Phase 2a: Add preview session cookie storage to shopify_connections.
-- The cookie is AES-256-CBC encrypted (same scheme as access_token_encrypted).
ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS preview_cookie_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS preview_cookie_expires_at TIMESTAMPTZ;
