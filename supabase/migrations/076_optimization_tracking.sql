-- Token optimization tracking columns (Phase 0 of Token Optimization Realignment)
-- Adds cache-aware billing columns to usage_records and optimization tracking to agent_tier_metrics.

-- usage_records: cache-aware token tracking
ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0;

-- agent_tier_metrics: optimization tracking
ALTER TABLE public.agent_tier_metrics
  ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS microcompaction_cold_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS microcompaction_reread_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS microcompaction_tokens_saved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS knowledge_tool_calls INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compaction_events INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_optimizations TEXT[] DEFAULT '{}';

-- Index for filtering by optimization flags
CREATE INDEX IF NOT EXISTS idx_tier_metrics_optimizations
  ON agent_tier_metrics USING gin (active_optimizations);
