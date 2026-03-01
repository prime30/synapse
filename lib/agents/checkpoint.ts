/**
 * Execution checkpointing (Fix 4: System Design Hardening).
 *
 * Saves intermediate state during long-running orchestrations
 * so they can survive crashes and resume from the last checkpoint.
 */

import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';
import type { AgentResult, CodeChange } from '@/lib/types/agent';

const TTL_MS = 30 * 60 * 1000; // 30 minutes (longer than execution TTL for recovery)

const CHECKPOINT_SCHEMA_VERSION = 2;

interface CheckpointData {
  schemaVersion: number;
  executionId: string;
  phase: 'pm_complete' | 'specialist_complete' | 'review_complete' | 'flat_iteration';
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
  /** File IDs modified during this execution (for FileStore reconstruction) */
  dirtyFileIds: string[];
  /** Accumulated changes for cross-phase continuity */
  accumulatedChanges?: CodeChange[];
  /** Flat-pipeline iteration counter (for resume) */
  iteration?: number;
}

/** Track wall-clock time remaining for the current function invocation */
export function createDeadlineTracker(startTimeMs: number, maxDurationMs: number) {
  return {
    remainingMs: () => Math.max(0, maxDurationMs - (Date.now() - startTimeMs)),
    shouldCheckpoint: (safetyMarginMs = 60_000) =>
      maxDurationMs - (Date.now() - startTimeMs) < safetyMarginMs,
  };
}

/** Whether the background resume feature is enabled */
export function isBackgroundResumeEnabled(): boolean {
  return process.env.ENABLE_BACKGROUND_RESUME === 'true';
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
  directChanges?: CodeChange[],
  dirtyFileIds: string[] = [],
  accumulatedChanges?: CodeChange[],
): Promise<void> {
  const cache = getCache();
  const data: CheckpointData = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    executionId,
    phase: 'pm_complete',
    timestamp: Date.now(),
    pmResult: { delegations, directChanges },
    completedSpecialists: [],
    dirtyFileIds,
    accumulatedChanges,
  };
  await cache.set(checkpointKey(executionId), data, TTL_MS);
}

/** Update checkpoint after a specialist completes */
export async function saveAfterSpecialist(
  executionId: string,
  agent: string,
  result: AgentResult,
  dirtyFileIds?: string[],
  accumulatedChanges?: CodeChange[],
): Promise<void> {
  const cache = getCache();
  const existing = await cache.get<CheckpointData>(checkpointKey(executionId));
  if (!existing) return;

  existing.phase = 'specialist_complete';
  existing.timestamp = Date.now();
  existing.completedSpecialists.push({ agent, result });
  if (dirtyFileIds) existing.dirtyFileIds = dirtyFileIds;
  if (accumulatedChanges) existing.accumulatedChanges = accumulatedChanges;
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

/** Get checkpoint for an execution (for resume logic).
 *  Returns null if the schema version is outdated (safe degradation). */
export async function getCheckpoint(executionId: string): Promise<CheckpointData | null> {
  const cache = getCache();
  const data = await cache.get<CheckpointData>(checkpointKey(executionId));
  if (!data) return null;
  if (data.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    console.warn(`[checkpoint] Discarding stale checkpoint for ${executionId} (schema v${data.schemaVersion} != v${CHECKPOINT_SCHEMA_VERSION})`);
    await cache.delete(checkpointKey(executionId));
    return null;
  }
  return data;
}

/** Save an arbitrary checkpoint (used by flat pipeline for mid-run state). */
export async function saveCheckpoint(executionId: string, data: CheckpointData): Promise<void> {
  const cache = getCache();
  data.schemaVersion = CHECKPOINT_SCHEMA_VERSION;
  await cache.set(checkpointKey(executionId), data, TTL_MS);
}

/** Clear checkpoint after successful completion */
export async function clearCheckpoint(executionId: string): Promise<void> {
  const cache = getCache();
  await cache.delete(checkpointKey(executionId));
}

export type { CheckpointData };
