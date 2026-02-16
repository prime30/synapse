-- Migration 042: Agent traces table for EPIC B (observability)

CREATE TABLE IF NOT EXISTS agent_traces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  total_duration_ms INT,
  span_count INT NOT NULL DEFAULT 0,
  spans JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_project ON agent_traces (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_user ON agent_traces (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_trace ON agent_traces (trace_id);

ALTER TABLE agent_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own traces" ON agent_traces
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access" ON agent_traces
  FOR ALL
  USING (true)
  WITH CHECK (true);