-- Add edit success metrics columns to agent_tier_metrics
ALTER TABLE agent_tier_metrics
  ADD COLUMN IF NOT EXISTS edit_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edit_first_pass_success integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_cascade_depth real DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edit_tool_distribution jsonb DEFAULT '{}'::jsonb;
