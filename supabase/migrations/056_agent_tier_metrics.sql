-- Agent tier metrics for efficiency overhaul telemetry
CREATE TABLE IF NOT EXISTS agent_tier_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('TRIVIAL', 'SIMPLE', 'COMPLEX', 'ARCHITECTURAL')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  files_preloaded integer NOT NULL DEFAULT 0,
  files_read_on_demand integer NOT NULL DEFAULT 0,
  iterations integer NOT NULL DEFAULT 0,
  first_token_ms integer NOT NULL DEFAULT 0,
  total_ms integer NOT NULL DEFAULT 0,
  edit_success boolean NOT NULL DEFAULT false,
  pipeline_version text NOT NULL DEFAULT 'legacy' CHECK (pipeline_version IN ('legacy', 'lean')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_tier_metrics_created ON agent_tier_metrics (created_at DESC);
CREATE INDEX idx_tier_metrics_tier ON agent_tier_metrics (tier, pipeline_version);
