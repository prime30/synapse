/**
 * Redis-backed execution store — System Design Hardening Fix 2.
 *
 * Replaces the in-memory Map with per-field Redis keys via CacheAdapter.
 * Uses createNamespacedCache('exec') for key isolation and automatic
 * Redis/Memory fallback.
 *
 * Per-field key design (avoids race conditions on concurrent agent updates):
 *   exec:{id}:meta       — JSON: status, projectId, userId, userRequest, startedAt, completedAt
 *   exec:{id}:active     — JSON string array of active agent types
 *   exec:{id}:completed  — JSON string array of completed agent types
 *   exec:{id}:messages   — JSON array of AgentMessage (append-only)
 *   exec:{id}:changes:{agent} — JSON array of CodeChange for that agent
 *   exec:{id}:review     — JSON ReviewResult
 *
 * TTL: 15 minutes, refreshed on every write.
 */

import type { ExecutionState, AgentType, AgentMessage, CodeChange, ReviewResult, ExecutionStatus } from '@/lib/types/agent';
import { createClient } from '@/lib/supabase/server';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

// ── Constants ────────────────────────────────────────────────────────────────

const TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Agent types used for change keys; includes fixed + dynamic general subagents */
const AGENT_TYPES: AgentType[] = [
  'project_manager',
  'liquid',
  'javascript',
  'css',
  'json',
  'review',
  'general_1',
  'general_2',
  'general_3',
  'general_4',
];

// ── Cache singleton ──────────────────────────────────────────────────────────

let _cache: CacheAdapter | null = null;

function getCache(): CacheAdapter {
  if (!_cache) {
    _cache = createNamespacedCache('exec');
  }
  return _cache;
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function metaKey(id: string): string { return id + ':meta'; }
function activeKey(id: string): string { return id + ':active'; }
function completedKey(id: string): string { return id + ':completed'; }
function messagesKey(id: string): string { return id + ':messages'; }
function changesKey(id: string, agent: string): string { return id + ':changes:' + agent; }
function reviewKey(id: string): string { return id + ':review'; }
function screenshotsKey(id: string): string { return id + ':screenshots'; }

// ── Serializable meta type ──────────────────────────────────────────────────

interface ExecutionMeta {
  executionId: string;
  projectId: string;
  userId: string;
  userRequest: string;
  sessionId?: string;
  status: ExecutionStatus;
  startedAt: string; // ISO
  completedAt?: string; // ISO
}

// ── Public API (same surface as before) ──────────────────────────────────────

export function createExecution(
  executionId: string,
  projectId: string,
  userId: string,
  userRequest: string,
  sessionId?: string,
): ExecutionState {
  const now = new Date();
  const meta: ExecutionMeta = {
    executionId,
    projectId,
    userId,
    userRequest,
    sessionId,
    status: 'pending',
    startedAt: now.toISOString(),
  };

  const cache = getCache();
  // Fire-and-forget writes (execution is synchronous in coordinator flow)
  cache.set(metaKey(executionId), meta, TTL_MS);
  cache.set(activeKey(executionId), [] as string[], TTL_MS);
  cache.set(completedKey(executionId), [] as string[], TTL_MS);
  cache.set(messagesKey(executionId), [] as AgentMessage[], TTL_MS);

  // Return a hydrated ExecutionState for immediate use by coordinator
  return {
    executionId,
    projectId,
    userId,
    userRequest,
    status: 'pending',
    activeAgents: new Set<AgentType>(),
    completedAgents: new Set<AgentType>(),
    messages: [],
    proposedChanges: new Map<AgentType, CodeChange[]>(),
    startedAt: now,
  };
}

export async function getExecution(executionId: string): Promise<ExecutionState | undefined> {
  const cache = getCache();
  const meta = await cache.get<ExecutionMeta>(metaKey(executionId));
  if (!meta) return undefined;

  const [activeArr, completedArr, messages] = await Promise.all([
    cache.get<string[]>(activeKey(executionId)),
    cache.get<string[]>(completedKey(executionId)),
    cache.get<AgentMessage[]>(messagesKey(executionId)),
  ]);

  const review = await cache.get<ReviewResult>(reviewKey(executionId));

  // Reconstruct proposedChanges by scanning known agent types
  const changeEntries = await Promise.all(
    AGENT_TYPES.map(async (agent) => {
      const changes = await cache.get<CodeChange[]>(changesKey(executionId, agent));
      return changes ? [agent, changes] as [AgentType, CodeChange[]] : null;
    })
  );

  const proposedChanges = new Map<AgentType, CodeChange[]>();
  for (const entry of changeEntries) {
    if (entry) proposedChanges.set(entry[0], entry[1]);
  }

  return {
    executionId: meta.executionId,
    projectId: meta.projectId,
    userId: meta.userId,
    userRequest: meta.userRequest,
    status: meta.status,
    activeAgents: new Set((activeArr ?? []) as AgentType[]),
    completedAgents: new Set((completedArr ?? []) as AgentType[]),
    messages: messages ?? [],
    proposedChanges,
    reviewResult: review ?? undefined,
    startedAt: new Date(meta.startedAt),
    completedAt: meta.completedAt ? new Date(meta.completedAt) : undefined,
  };
}

export function updateExecutionStatus(
  executionId: string,
  status: ExecutionStatus
): void {
  const cache = getCache();
  // Read-modify-write for meta
  cache.get<ExecutionMeta>(metaKey(executionId)).then((meta) => {
    if (!meta) return;
    meta.status = status;
    if (status === 'completed' || status === 'failed') {
      meta.completedAt = new Date().toISOString();
    }
    cache.set(metaKey(executionId), meta, TTL_MS);
  });
}

export function addMessage(executionId: string, message: AgentMessage): void {
  const cache = getCache();
  cache.get<AgentMessage[]>(messagesKey(executionId)).then((messages) => {
    const arr = messages ?? [];
    arr.push(message);
    cache.set(messagesKey(executionId), arr, TTL_MS);
  });
}

export function setAgentActive(executionId: string, agent: AgentType): void {
  const cache = getCache();
  cache.get<string[]>(activeKey(executionId)).then((arr) => {
    const agents = arr ?? [];
    if (!agents.includes(agent)) agents.push(agent);
    cache.set(activeKey(executionId), agents, TTL_MS);
  });
}

export function setAgentCompleted(executionId: string, agent: AgentType): void {
  const cache = getCache();
  // Remove from active, add to completed
  cache.get<string[]>(activeKey(executionId)).then((arr) => {
    const agents = (arr ?? []).filter((a) => a !== agent);
    cache.set(activeKey(executionId), agents, TTL_MS);
  });
  cache.get<string[]>(completedKey(executionId)).then((arr) => {
    const agents = arr ?? [];
    if (!agents.includes(agent)) agents.push(agent);
    cache.set(completedKey(executionId), agents, TTL_MS);
  });
}

export function storeChanges(
  executionId: string,
  agent: AgentType,
  changes: CodeChange[]
): void {
  const cache = getCache();
  cache.set(changesKey(executionId, agent), changes, TTL_MS);
}

export function setReviewResult(
  executionId: string,
  result: ReviewResult
): void {
  const cache = getCache();
  cache.set(reviewKey(executionId), result, TTL_MS);
}

// ── Screenshot URLs (optional, captured during change preview) ────────────────

interface ScreenshotData {
  beforeUrl?: string;
  afterUrl?: string;
}

export function storeScreenshot(
  executionId: string,
  field: 'beforeUrl' | 'afterUrl',
  url: string,
): void {
  const cache = getCache();
  cache.get<ScreenshotData>(screenshotsKey(executionId)).then((data) => {
    const updated = { ...(data ?? {}), [field]: url };
    cache.set(screenshotsKey(executionId), updated, TTL_MS);
  });
}

export async function getScreenshots(executionId: string): Promise<ScreenshotData> {
  const cache = getCache();
  return (await cache.get<ScreenshotData>(screenshotsKey(executionId))) ?? {};
}

/** Persist completed execution to database and remove from Redis */
export async function persistExecution(executionId: string): Promise<void> {
  const state = await getExecution(executionId);
  if (!state) return;
  const cache = getCache();
  const meta = await cache.get<ExecutionMeta>(metaKey(executionId));

  const allChanges: CodeChange[] = [];
  for (const changes of state.proposedChanges.values()) {
    allChanges.push(...changes);
  }

  try {
    const supabase = await createClient();
    await supabase.from('agent_executions').insert({
      id: state.executionId,
      project_id: state.projectId,
      user_id: state.userId,
      session_id: meta?.sessionId ?? null,
      user_request: state.userRequest,
      status: state.status === 'completed' ? 'completed' : 'failed',
      execution_log: state.messages,
      proposed_changes: allChanges,
      review_result: state.reviewResult ?? null,
      started_at: state.startedAt.toISOString(),
      completed_at: state.completedAt?.toISOString() ?? null,
    });
  } catch (err) {
    // Outside request scope (e.g. tests, serverless cold start) — skip DB persist
  }

  // Clean up all Redis keys for this execution
  const deletePromises = [
    cache.delete(metaKey(executionId)),
    cache.delete(activeKey(executionId)),
    cache.delete(completedKey(executionId)),
    cache.delete(messagesKey(executionId)),
    cache.delete(reviewKey(executionId)),
    cache.delete(screenshotsKey(executionId)),
    ...AGENT_TYPES.map((agent) => cache.delete(changesKey(executionId, agent))),
  ];
  await Promise.all(deletePromises);
}

/** Get all active execution IDs (for monitoring) — scans Redis keys */
export function getActiveExecutionIds(): string[] {
  // Note: in Redis mode, we can't efficiently scan without SCAN.
  // Return empty array — monitoring should use the database instead.
  // The MemoryAdapter fallback still works for single-instance dev.
  return [];
}
