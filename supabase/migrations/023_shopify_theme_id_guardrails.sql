-- Segment E: Guardrails for theme_id on shopify_connections.
-- theme_id stores the Shopify theme ID (numeric, as text). Constrain format so we never persist invalid values.
-- Existing connections with NULL theme_id are upgraded when GET /api/projects/[projectId]/shopify runs (ensureDevTheme).

-- Normalize invalid theme_id so constraint can be applied (backward-compatible rollout)
UPDATE public.shopify_connections
SET theme_id = NULL
WHERE theme_id IS NOT NULL
  AND (theme_id = '' OR theme_id !~ '^\d+$');

ALTER TABLE public.shopify_connections
  DROP CONSTRAINT IF EXISTS shopify_connections_theme_id_format;

ALTER TABLE public.shopify_connections
  ADD CONSTRAINT shopify_connections_theme_id_format
  CHECK (theme_id IS NULL OR (theme_id <> '' AND theme_id ~ '^\d+$'));

COMMENT ON COLUMN public.shopify_connections.theme_id IS 'Shopify theme ID for dev preview (numeric ID as text). Set by theme provisioning; null until ensureDevTheme runs.';
