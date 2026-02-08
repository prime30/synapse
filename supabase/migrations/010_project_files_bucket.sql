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
