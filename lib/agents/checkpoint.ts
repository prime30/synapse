/**
 * Execution checkpointing (Fix 4: System Design Hardening).
 *
 * Saves intermediate state during long-running orchestrations
 * so they can survive crashes and resume from the last checkpoint.
 */

import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';
import type { AgentResult, CodeChange } from '@/lib/types/agent';

const TTL_MS = 30 * 60 * 1000; // 30 minutes (longer than execution TTL for recovery)

interface CheckpointData {
  executionId: string;
  phase: 'pm_complete' | 'specialist_complete' | 'review_complete';
  timestamp: number;
  /** PM analysis result (saved after PM phase) */
  pmResult?: {
    delegations: Array<{ agent: string; task: string; affectedFiles: string[] }>;
    directChanges?: CodeChange[];
  };
  /** Completed specialist results so far */
  completedSpecialists: Array<{
    agent: string;
    result: AgentResult;
  }>;
  /** Review result if review phase completed */
  reviewCompleted?: boolean;
}

let _cache: CacheAdapter | null = null;

function getCache(): CacheAdapter {
  if (!_cache) {
    _cache = createNamespacedCache('checkpoint');
  }
  return _cache;
}

function checkpointKey(executionId: string): string {
  return executionId;
}

/** Save a checkpoint after PM analysis completes */
export async function saveAfterPM(
  executionId: string,
  delegations: Array<{ agent: string; task: string; affectedFiles: string[] }>,
  directChanges?: CodeChange[]
): Promise<void> {
  const cache = getCache();
  const data: CheckpointData = {
    executionId,
    phase: 'pm_complete',
    timestamp: Date.now(),
    pmResult: { delegations, directChanges },
    completedSpecialists: [],
  };
  await cache.set(checkpointKey(executionId), data, TTL_MS);
}

/** Update checkpoint after a specialist completes */
export async function saveAfterSpecialist(
  executionId: string,
  agent: string,
  result: AgentResult
): Promise<void> {
  const cache = getCache();
  const existing = await cache.get<CheckpointData>(checkpointKey(executionId));
  if (!existing) return;

  existing.phase = 'specialist_complete';
  existing.timestamp = Date.now();
  existing.completedSpecialists.push({ agent, result });
  await cache.set(checkpointKey(executionId), existing, TTL_MS);
}

/** Update checkpoint after review completes */
export async function saveAfterReview(executionId: string): Promise<void> {
  const cache = getCache();
  const existing = await cache.get<CheckpointData>(checkpointKey(executionId));
  if (!existing) return;

  existing.phase = 'review_complete';
  existing.timestamp = Date.now();
  existing.reviewCompleted = true;
  await cache.set(checkpointKey(executionId), existing, TTL_MS);
}

/** Get checkpoint for an execution (for resume logic) */
export async function getCheckpoint(executionId: string): Promise<CheckpointData | null> {
  const cache = getCache();
  return cache.get<CheckpointData>(checkpointKey(executionId));
}

/** Clear checkpoint after successful completion */
export async function clearCheckpoint(executionId: string): Promise<void> {
  const cache = getCache();
  await cache.delete(checkpointKey(executionId));
}

export type { CheckpointData };
