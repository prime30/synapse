/**
 * Background task runner -- EPIC F
 *
 * Task registry + dispatcher.  Tasks self-register at import time.
 * Vercel Cron hits /api/internal/cron which calls dispatchNext() in a loop.
 *
 * Uses Supabase `background_tasks` table with optimistic locking to prevent
 * duplicate execution across concurrent serverless invocations.
 */

import { createServiceClient } from '@/lib/supabase/admin';

// -- Types --------------------------------------------------------------------

export interface TaskResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface TaskDefinition {
  name: string;
  handler: () => Promise<TaskResult>;
  intervalMinutes: number;
  maxRetries: number;
}

interface BackgroundTaskRow {
  id: string;
  task_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: unknown;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

// -- Backoff ------------------------------------------------------------------

const BACKOFF_MINUTES = [1, 5, 15]; // exponential backoff steps

function getBackoffMs(retryCount: number): number {
  const minutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)];
  return minutes * 60 * 1000;
}

// -- TaskRunner ---------------------------------------------------------------

class TaskRunner {
  private registry = new Map<string, TaskDefinition>();

  /** Register a task definition. Idempotent. */
  register(def: TaskDefinition): void {
    this.registry.set(def.name, def);
  }

  /** List all registered task definitions. */
  getRegistered(): TaskDefinition[] {
    return Array.from(this.registry.values());
  }

  /**
   * Schedule pending rows for any registered tasks that are due.
   * A task is "due" if it has never run, or its last run was longer
   * ago than its intervalMinutes.
   */
  async scheduleAllDue(): Promise<number> {
    const supabase = createServiceClient();
    let scheduled = 0;

    for (const def of this.registry.values()) {
      // Find the most recent row for this task
      const { data: recent } = await supabase
        .from('background_tasks')
        .select('scheduled_at')
        .eq('task_name', def.name)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single();

      const intervalMs = def.intervalMinutes * 60 * 1000;
      const lastScheduled = recent?.scheduled_at
        ? new Date(recent.scheduled_at).getTime()
        : 0;
      const now = Date.now();

      if (now - lastScheduled >= intervalMs) {
        await supabase.from('background_tasks').insert({
          task_name: def.name,
          status: 'pending',
          max_retries: def.maxRetries,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }

    return scheduled;
  }

  /**
   * Dispatch and execute the next pending task.
   *
   * Uses optimistic locking: select next pending, then update status
   * to 'running' only if it's still pending (prevents double-execution
   * across concurrent serverless invocations).
   */
  async dispatchNext(): Promise<{ taskName: string; result: TaskResult } | null> {
    const supabase = createServiceClient();

    // 1. Find next pending task
    const { data: pending } = await supabase
      .from('background_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .single();

    if (!pending) return null;

    const task = pending as BackgroundTaskRow;

    // 2. Optimistic lock: set to 'running' only if still pending
    const { data: locked, error: lockError } = await supabase
      .from('background_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending') // optimistic lock
      .select()
      .single();

    if (lockError || !locked) {
      // Another invocation grabbed it first
      return null;
    }

    // 3. Find the registered handler
    const def = this.registry.get(task.task_name);
    if (!def) {
      await supabase
        .from('background_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: `No handler registered for task: ${task.task_name}`,
        })
        .eq('id', task.id);

      return {
        taskName: task.task_name,
        result: { success: false, message: `No handler for ${task.task_name}` },
      };
    }

    // 4. Execute the handler
    try {
      const result = await def.handler();

      await supabase
        .from('background_tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          error: result.success ? null : (result.message ?? 'Unknown error'),
        })
        .eq('id', task.id);

      // If failed but retries remaining, schedule a retry
      if (!result.success && task.retry_count < task.max_retries) {
        const backoffMs = getBackoffMs(task.retry_count);
        await supabase.from('background_tasks').insert({
          task_name: task.task_name,
          status: 'pending',
          retry_count: task.retry_count + 1,
          max_retries: task.max_retries,
          scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
        });
      }

      return { taskName: task.task_name, result };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await supabase
        .from('background_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: errorMessage,
        })
        .eq('id', task.id);

      // Schedule retry if retries remaining
      if (task.retry_count < task.max_retries) {
        const backoffMs = getBackoffMs(task.retry_count);
        await supabase.from('background_tasks').insert({
          task_name: task.task_name,
          status: 'pending',
          retry_count: task.retry_count + 1,
          max_retries: task.max_retries,
          scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
        });
      }

      return {
        taskName: task.task_name,
        result: { success: false, message: errorMessage },
      };
    }
  }
}

// -- Singleton ----------------------------------------------------------------

let _runner: TaskRunner | null = null;

export function getTaskRunner(): TaskRunner {
  if (!_runner) {
    _runner = new TaskRunner();
  }
  return _runner;
}
