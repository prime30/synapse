import { z } from 'zod';

/** ISO 8601 timestamp string */
const iso8601 = z.string();

/** Task status */
export const TaskStatusSchema = z.enum([
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'failed',
  'blocked',
]);

/** Task definition (tasks/{task_id}.json) */
export const TaskSchema = z.object({
  task_id: z.string().uuid(),
  requirement_id: z.string(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  assigned_to: z.string().nullable(),
  dependencies: z.array(z.string()),
  blocks: z.array(z.string()),
  files_to_modify: z.array(z.string()),
  estimated_complexity: z.number().int().min(1).max(5),
  created_at: iso8601,
  updated_at: iso8601,
  completed_at: iso8601.nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

/** Task assignment (tasks/assignments/{agent_id}.json) */
export const TaskAssignmentSchema = z.object({
  agent_id: z.string(),
  task_id: z.string().nullable(),
  assigned_at: iso8601.nullable(),
  status: z.enum(['idle', 'working', 'blocked']),
});

export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;

/** Agent status (status/agents/{agent_id}.json) */
export const AgentStatusSchema = z.object({
  agent_id: z.string(),
  status: z.enum(['active', 'idle', 'error', 'stale']),
  current_task_id: z.string().nullable(),
  last_heartbeat: iso8601,
  capabilities: z.array(z.string()),
  error_message: z.string().nullable(),
  started_at: iso8601,
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** Epic state (status/epic_state.json) */
export const EpicStateSchema = z.object({
  epic_id: z.string(),
  status: z.enum(['planning', 'in_progress', 'completed', 'failed']),
  total_tasks: z.number().int().min(0),
  completed_tasks: z.number().int().min(0),
  failed_tasks: z.number().int().min(0),
  blocked_tasks: z.number().int().min(0),
  active_agents: z.array(z.string()),
  started_at: iso8601,
  updated_at: iso8601,
  completed_at: iso8601.nullable(),
});

export type EpicState = z.infer<typeof EpicStateSchema>;

/** Task entry in dependency graph */
export const DependencyTaskEntrySchema = z.object({
  depends_on: z.array(z.string()),
  blocks: z.array(z.string()),
  files: z.array(z.string()),
});

/** Dependency graph (coordination/dependency-graph.json) */
export const DependencyGraphSchema = z.object({
  tasks: z.record(z.string(), DependencyTaskEntrySchema),
  updated_at: iso8601,
});

export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

/** Agent in pool (coordination/agent-pool.json) */
export const AgentPoolEntrySchema = z.object({
  agent_id: z.string(),
  capabilities: z.array(z.string()),
  max_concurrent_tasks: z.number().int().min(1).optional().default(1),
  status: z.enum(['available', 'busy', 'offline']),
});

/** Agent pool */
export const AgentPoolSchema = z.object({
  agents: z.array(AgentPoolEntrySchema),
  updated_at: iso8601,
});

export type AgentPool = z.infer<typeof AgentPoolSchema>;

/** File lock entry */
export const FileLockEntrySchema = z.object({
  locked_by: z.string(),
  task_id: z.string(),
  locked_at: iso8601,
  expires_at: iso8601,
});

/** File locks (coordination/file_locks.json) */
export const FileLockSchema = z.object({
  locks: z.record(z.string(), FileLockEntrySchema),
  updated_at: iso8601,
});

export type FileLock = z.infer<typeof FileLockSchema>;
