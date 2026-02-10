-- Create profiles table extending auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization members junction table
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shopify_store_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- File type enum
CREATE TYPE public.file_type AS ENUM ('liquid', 'javascript', 'css', 'other');

-- Files table with smart storage strategy
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type public.file_type NOT NULL DEFAULT 'other',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content TEXT,                    -- For files <100KB
  storage_path TEXT,               -- For files >=100KB (Supabase Storage)
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, path)
);

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- AI provider enum
CREATE TYPE public.ai_provider AS ENUM ('anthropic', 'openai');

-- AI sessions table
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider public.ai_provider NOT NULL,
  model TEXT NOT NULL,
  title TEXT,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ai_sessions_updated_at
  BEFORE UPDATE ON public.ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- Message role enum
CREATE TYPE public.message_role AS ENUM ('system', 'user', 'assistant');

-- AI messages table
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);



-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Organizations: members can view, owners can modify
CREATE POLICY "Org members can view organization"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can update organization"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Org owners can delete organization"
  ON public.organizations FOR DELETE
  USING (owner_id = auth.uid());

-- Organization members: members can view, admins/owners can manage
CREATE POLICY "Org members can view members"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can remove members"
  ON public.organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Projects: org members can view, project owner can modify
CREATE POLICY "Org members can view projects"
  ON public.projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can update projects"
  ON public.projects FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Project owners can delete projects"
  ON public.projects FOR DELETE
  USING (owner_id = auth.uid());

-- Files: accessible by project org members
CREATE POLICY "Org members can view project files"
  ON public.files FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create files"
  ON public.files FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update files"
  ON public.files FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete files"
  ON public.files FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- AI sessions: users can manage their own sessions
CREATE POLICY "Users can view own AI sessions"
  ON public.ai_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create AI sessions"
  ON public.ai_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own AI sessions"
  ON public.ai_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- AI messages: accessible via session ownership
CREATE POLICY "Users can view messages in own sessions"
  ON public.ai_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.ai_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own sessions"
  ON public.ai_messages FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.ai_sessions WHERE user_id = auth.uid()
    )
  );



-- Indexes for foreign keys and common queries

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- Organization members
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_org ON public.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);

-- Files
CREATE INDEX IF NOT EXISTS idx_files_project ON public.files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON public.files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_project_path ON public.files(project_id, path);

-- AI sessions
CREATE INDEX IF NOT EXISTS idx_ai_sessions_project ON public.ai_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON public.ai_sessions(user_id);

-- AI messages
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON public.ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON public.ai_messages(created_at);



-- Add REQ-4 file management constraints

-- Unique filename per project (REQ-4 uses name as identifier for flat file structure)
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_project_name ON public.files(project_id, name);

-- Ensure content and storage_path are mutually exclusive (exactly one must be set)
ALTER TABLE public.files
  DROP CONSTRAINT IF EXISTS files_content_storage_check;
ALTER TABLE public.files
  ADD CONSTRAINT files_content_storage_check CHECK (
    (content IS NOT NULL AND storage_path IS NULL) OR
    (content IS NULL AND storage_path IS NOT NULL)
  );



-- Create project-files storage bucket for REQ-4
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  10485760,  -- 10MB
  ARRAY['text/plain', 'application/javascript', 'text/css']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can access files from their projects
CREATE POLICY "Org members can access project files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );



-- Create custom Liquid tags and filters registry tables for REQ-6

-- Custom Liquid Tags table
CREATE TABLE IF NOT EXISTS public.custom_liquid_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  signature TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_liquid_tags_project_id ON public.custom_liquid_tags(project_id);

-- Updated_at trigger for custom_liquid_tags
CREATE TRIGGER custom_liquid_tags_updated_at
  BEFORE UPDATE ON public.custom_liquid_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Custom Liquid Filters table
CREATE TABLE IF NOT EXISTS public.custom_liquid_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'any',
  output_type TEXT NOT NULL DEFAULT 'string',
  parameters JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_liquid_filters_project_id ON public.custom_liquid_filters(project_id);

-- Updated_at trigger for custom_liquid_filters
CREATE TRIGGER custom_liquid_filters_updated_at
  BEFORE UPDATE ON public.custom_liquid_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS on both tables
ALTER TABLE public.custom_liquid_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_liquid_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_liquid_tags (same pattern as files table)
CREATE POLICY "Org members can view project custom liquid tags"
  ON public.custom_liquid_tags FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create custom liquid tags"
  ON public.custom_liquid_tags FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update custom liquid tags"
  ON public.custom_liquid_tags FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete custom liquid tags"
  ON public.custom_liquid_tags FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS Policies for custom_liquid_filters (same pattern as files table)
CREATE POLICY "Org members can view project custom liquid filters"
  ON public.custom_liquid_filters FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create custom liquid filters"
  ON public.custom_liquid_filters FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update custom liquid filters"
  ON public.custom_liquid_filters FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete custom liquid filters"
  ON public.custom_liquid_filters FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );



-- REQ-9: File version history schema
CREATE TABLE IF NOT EXISTS public.file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  structure JSONB DEFAULT '{}',
  relationships JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary TEXT,
  parent_version_id UUID REFERENCES public.file_versions(id),
  UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file ON public.file_versions(file_id);
CREATE INDEX idx_file_versions_created ON public.file_versions(created_at DESC);
CREATE INDEX idx_file_versions_number ON public.file_versions(file_id, version_number DESC);

-- Enable RLS
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

-- RLS: Org members can view file versions through projects
CREATE POLICY "Org members can view file versions"
  ON public.file_versions FOR SELECT
  USING (
    file_id IN (
      SELECT f.id FROM public.files f
      JOIN public.projects p ON p.id = f.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS: Org members can create file versions
CREATE POLICY "Org members can create file versions"
  ON public.file_versions FOR INSERT
  WITH CHECK (
    file_id IN (
      SELECT f.id FROM public.files f
      JOIN public.projects p ON p.id = f.project_id
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );



-- Create enums for suggestion system
CREATE TYPE public.suggestion_source AS ENUM ('ai_model', 'static_rule', 'hybrid');
CREATE TYPE public.suggestion_scope AS ENUM ('single_line', 'multi_line', 'multi_file');
CREATE TYPE public.suggestion_status AS ENUM ('pending', 'applied', 'rejected', 'edited', 'undone');

-- Suggestions table
CREATE TABLE IF NOT EXISTS public.suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source public.suggestion_source NOT NULL,
  scope public.suggestion_scope NOT NULL,
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  file_paths JSONB NOT NULL DEFAULT '[]',
  original_code TEXT NOT NULL,
  suggested_code TEXT NOT NULL,
  applied_code TEXT,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON public.suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_project ON public.suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON public.suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON public.suggestions(created_at DESC);

-- Enable RLS
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies: org members can access suggestions for their projects
CREATE POLICY "Org members can view project suggestions"
  ON public.suggestions FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create suggestions"
  ON public.suggestions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update suggestions"
  ON public.suggestions FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete suggestions"
  ON public.suggestions FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER suggestions_updated_at
  BEFORE UPDATE ON public.suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



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



CREATE TABLE IF NOT EXISTS public.preview_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_width INTEGER NOT NULL DEFAULT 1440,
  page_type TEXT NOT NULL DEFAULT 'home',
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_preview_states_project ON public.preview_states(project_id);

ALTER TABLE public.preview_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project preview states"
  ON public.preview_states FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create project preview states"
  ON public.preview_states FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update project preview states"
  ON public.preview_states FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete project preview states"
  ON public.preview_states FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE TRIGGER preview_states_updated_at
  BEFORE UPDATE ON public.preview_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



CREATE TYPE public.user_presence_state AS ENUM ('active', 'idle', 'offline');

CREATE TABLE IF NOT EXISTS public.user_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_path TEXT,
  cursor_position JSONB,
  state public.user_presence_state NOT NULL DEFAULT 'active',
  color TEXT NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_presence_project ON public.user_presence(project_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_state ON public.user_presence(state);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project presence"
  ON public.user_presence FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can upsert project presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update project presence"
  ON public.user_presence FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete project presence"
  ON public.user_presence FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE TRIGGER user_presence_updated_at
  BEFORE UPDATE ON public.user_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  variables JSONB DEFAULT '[]'::jsonb,
  content TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON public.templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON public.templates(workspace_id);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view templates"
  ON public.templates FOR SELECT
  USING (workspace_id IS NULL OR auth.uid() IS NOT NULL);

CREATE POLICY "Org members can manage templates"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Org members can update templates"
  ON public.templates FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Org members can delete templates"
  ON public.templates FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- When an organization is created, add the owner as an organization_members row
-- so they can access the org (RLS requires membership to see the org).
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();



-- RPC to create a project (and personal org if needed) without touching
-- organizations/organization_members from the client, avoiding schema-cache issues.
CREATE OR REPLACE FUNCTION public.create_first_project(
  p_name text DEFAULT 'My project',
  p_description text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_project_id uuid;
  v_project_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use first existing org for this user
  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE user_id = v_user_id
  LIMIT 1;

  -- If no org, create personal org (trigger will add user to organization_members)
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES (
      'Personal',
      'personal-' || replace(gen_random_uuid()::text, '-', ''),
      v_user_id
    )
    RETURNING id INTO v_org_id;
  END IF;

  -- Create project
  INSERT INTO public.projects (name, description, organization_id, owner_id)
  VALUES (
    COALESCE(NULLIF(trim(p_name), ''), 'My project'),
    NULLIF(trim(p_description), ''),
    v_org_id,
    v_user_id
  )
  RETURNING id, name INTO v_project_id, v_project_name;

  RETURN json_build_object('id', v_project_id, 'name', v_project_name);
END;
$$;

-- Allow authenticated users to call this
GRANT EXECUTE ON FUNCTION public.create_first_project(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_first_project(text, text) TO service_role;

-- ============================================================
-- 020: list_user_projects RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_user_projects()
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT row_to_json(t) FROM (
      SELECT
        p.id,
        p.name,
        p.description,
        p.organization_id,
        p.shopify_store_url,
        p.created_at,
        p.updated_at
      FROM public.projects p
      JOIN public.organization_members om
        ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
      ORDER BY p.updated_at DESC
    ) t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_projects() TO service_role;


