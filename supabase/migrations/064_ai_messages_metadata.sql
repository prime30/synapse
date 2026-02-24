-- Add metadata column to store structured tool call context (tool calls, tool results)
-- for full conversation context awareness across turns.
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- GIN index for querying messages with tool metadata
CREATE INDEX IF NOT EXISTS idx_ai_messages_metadata_tools
  ON public.ai_messages USING GIN (metadata jsonb_path_ops)
  WHERE metadata IS NOT NULL;
