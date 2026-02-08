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
