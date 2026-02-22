-- Performance indexes for agent execution queries and file lookups.

-- Speeds up session-scoped execution history queries (used by referential artifact ledger)
CREATE INDEX IF NOT EXISTS idx_agent_executions_session_project
  ON public.agent_executions(session_id, project_id)
  WHERE session_id IS NOT NULL;

-- Speeds up file lookup by path within project (used by resolveFileFromDatabase OR query)
CREATE INDEX IF NOT EXISTS idx_files_project_path
  ON public.files(project_id, path);

-- Speeds up file lookup by name within project
CREATE INDEX IF NOT EXISTS idx_files_project_name
  ON public.files(project_id, name);
