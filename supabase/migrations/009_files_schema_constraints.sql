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
