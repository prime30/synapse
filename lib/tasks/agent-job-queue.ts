/**
 * Agent Job Queue — System Design Hardening Fix 4.
 *
 * Extends the existing Postgres-based background_tasks system with
 * agent-specific enqueue/poll helpers. Agent executions are stored as
 * background_task rows with task_name = 'agent_execution'.
 *
 * The stream route can:
 *   1. Enqueue an agent execution (returns a jobId)
 *   2. Poll execution progress from Redis (execution-store) via SSE
 *
 * A dedicated dispatch endpoint (/api/internal/agent-dispatch) picks
 * up pending agent jobs and runs them. It can be called by:
 *   - Vercel Cron (every 1 minute)
 *   - Self-invoked fetch from the stream route for immediate dispatch
 */

import { createServiceClient } from '@/lib/supabase/admin';
import { getExecution } from '@/lib/agents/execution-store';

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentJobPayload {
  executionId: string;
  projectId: string;
  userId: string;
  userRequest: string;
  options?: Record<string, unknown>;
}

export interface AgentJob {
  id: string;
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: AgentJobPayload;
  createdAt: string;
}

// ── Enqueue ──────────────────────────────────────────────────────────────

/**
 * Enqueue an agent execution as a background_task row.
 * Returns the task row ID which can be used to poll status.
 */
export async function enqueueAgentJob(payload: AgentJobPayload): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('background_tasks')
    .insert({
      task_name: 'agent_execution',
      status: 'pending',
      payload,
      max_retries: 1,
      scheduled_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to enqueue agent job: ${error?.message ?? 'no ID returned'}`);
  }

  return data.id;
}

// ── Claim next pending agent job ─────────────────────────────────────────

/**
 * Claim and return the next pending agent_execution job using optimistic
 * locking (status = 'pending' -> 'running').
 * Returns null if no jobs are waiting.
 */
export async function claimNextAgentJob(): Promise<AgentJob | null> {
  const supabase = createServiceClient();

  // Find next pending agent_execution task
  const { data: pending } = await supabase
    .from('background_tasks')
    .select('id, payload, status, created_at')
    .eq('task_name', 'agent_execution')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .single();

  if (!pending) return null;

  // Optimistic lock: set to 'running' only if still pending
  const { data: locked, error: lockError } = await supabase
    .from('background_tasks')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id, payload, status, created_at')
    .single();

  if (lockError || !locked) {
    return null; // Another invocation grabbed it
  }

  const payload = locked.payload as AgentJobPayload;
  return {
    id: locked.id,
    executionId: payload.executionId,
    status: 'running',
    payload,
    createdAt: locked.created_at,
  };
}

// ── Complete / fail a job ────────────────────────────────────────────────

export async function completeAgentJob(jobId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('background_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function failAgentJob(jobId: string, errorMessage: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('background_tasks')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq('id', jobId);
}

// ── Poll execution progress ──────────────────────────────────────────────

/**
 * Poll execution progress from Redis (execution-store).
 * Returns the current execution state, or null if not found.
 * The stream route uses this in a short-lived poll loop to stream SSE events.
 */
export async function pollExecutionProgress(executionId: string) {
  return getExecution(executionId);
}

// ── Self-dispatch helper ─────────────────────────────────────────────────

/**
 * Trigger immediate dispatch by calling the agent-dispatch endpoint.
 * Fire-and-forget — errors are swallowed since Cron is the backup.
 */
export function triggerDispatch(baseUrl: string): void {
  const dispatchUrl = `${baseUrl}/api/internal/agent-dispatch`;
  const secret = process.env.CRON_SECRET ?? '';

  fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({ source: 'self-dispatch' }),
  }).catch((err) => {
    console.error('[agent-job-queue] self-dispatch failed:', err);
  });
}
