-- Sync status enums
CREATE TYPE public.shopify_sync_status AS ENUM ('connected', 'syncing', 'error', 'disconnected');
CREATE TYPE public.theme_file_sync_status AS ENUM ('synced', 'pending', 'conflict', 'error');

-- Shopify store connections
CREATE TABLE IF NOT EXISTS public.shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  store_domain TEXT NOT NULL,  -- e.g. mystore.myshopify.com
  access_token_encrypted TEXT NOT NULL,
  theme_id TEXT,
  last_sync_at TIMESTAMPTZ,
  sync_status public.shopify_sync_status NOT NULL DEFAULT 'disconnected',
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, store_domain),
  CHECK (store_domain LIKE '%.myshopify.com')
);

-- Theme files tracked for sync
CREATE TABLE IF NOT EXISTS public.theme_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.shopify_connections(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content_hash TEXT,  -- SHA-256 of content
  remote_updated_at TIMESTAMPTZ,
  local_updated_at TIMESTAMPTZ,
  sync_status public.theme_file_sync_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, file_path)
);

-- Indexes for shopify_connections
CREATE INDEX IF NOT EXISTS idx_shopify_connections_project ON public.shopify_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_sync_status ON public.shopify_connections(sync_status);

-- Indexes for theme_files
CREATE INDEX IF NOT EXISTS idx_theme_files_connection ON public.theme_files(connection_id);
CREATE INDEX IF NOT EXISTS idx_theme_files_sync_status ON public.theme_files(sync_status);

-- Enable RLS
ALTER TABLE public.shopify_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for shopify_connections: org members can access connections for their projects
CREATE POLICY "Org members can view project shopify connections"
  ON public.shopify_connections FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create shopify connections"
  ON public.shopify_connections FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update shopify connections"
  ON public.shopify_connections FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete shopify connections"
  ON public.shopify_connections FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS policies for theme_files: org members can access theme files for their project connections
CREATE POLICY "Org members can view project theme files"
  ON public.theme_files FOR SELECT
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create theme files"
  ON public.theme_files FOR INSERT
  WITH CHECK (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update theme files"
  ON public.theme_files FOR UPDATE
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete theme files"
  ON public.theme_files FOR DELETE
  USING (
    connection_id IN (
      SELECT sc.id FROM public.shopify_connections sc
      JOIN public.projects p ON p.id = sc.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Updated_at triggers
CREATE TRIGGER shopify_connections_updated_at
  BEFORE UPDATE ON public.shopify_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER theme_files_updated_at
  BEFORE UPDATE ON public.theme_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
