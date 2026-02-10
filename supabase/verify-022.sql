-- Run this in the Supabase SQL Editor after applying 022_agent_orchestration.sql
-- to confirm user_preferences and agent_executions exist.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_preferences', 'agent_executions')
ORDER BY table_name;

-- Optional: confirm the enum type exists
SELECT typname
FROM pg_type
WHERE typname = 'agent_execution_status';
