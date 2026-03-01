-- Add chunk metadata columns to file_embeddings for structural search
ALTER TABLE file_embeddings
  ADD COLUMN IF NOT EXISTS chunk_type TEXT,
  ADD COLUMN IF NOT EXISTS line_start INTEGER,
  ADD COLUMN IF NOT EXISTS line_end INTEGER,
  ADD COLUMN IF NOT EXISTS setting_id TEXT,
  ADD COLUMN IF NOT EXISTS chunk_references TEXT[];

CREATE INDEX IF NOT EXISTS idx_file_embeddings_chunk_type
  ON file_embeddings (chunk_type) WHERE chunk_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_file_embeddings_setting_id
  ON file_embeddings (setting_id) WHERE setting_id IS NOT NULL;
