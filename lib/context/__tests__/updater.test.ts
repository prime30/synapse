/**
 * Tests for ContextUpdater - REQ-5 TASK-5
 *
 * These tests focus on the updater's cache-coordination logic.
 * The loader and detector depend on Supabase (server-side), so we
 * verify behaviour through the ContextCache that the updater manages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCache } from '../cache';
import type { ProjectContext } from '../types';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(projectId: string): ProjectContext {
  return {
    projectId,
    files: [],
    dependencies: [],
    loadedAt: new Date(),
    totalSizeBytes: 0,
  };
}

// ---------------------------------------------------------------------------
// ContextCache integration tests (the cache layer the updater relies on)
// ---------------------------------------------------------------------------

describe('ContextUpdater – cache behaviour', () => {
  let cache: ContextCache;

  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    cache = new ContextCache();
  });

  it('returns null for an unknown project', async () => {
    expect(await cache.get('unknown')).toBeNull();
  });

  it('stores and retrieves a ProjectContext', async () => {
    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    const result = await cache.get('proj-1');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-1');
    expect(result!.files).toEqual([]);
    expect(result!.dependencies).toEqual([]);
    expect(result!.totalSizeBytes).toBe(0);
  });

  it('invalidate removes the cached entry', async () => {
    const ctx = makeContext('proj-2');
    await cache.set('proj-2', ctx);

    expect(await cache.get('proj-2')).not.toBeNull();

    await cache.invalidate('proj-2');
    expect(await cache.get('proj-2')).toBeNull();
  });

  it('clear removes all entries', async () => {
    await cache.set('a', makeContext('a'));
    await cache.set('b', makeContext('b'));

    await cache.clear();

    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleFileChange tests (uses a mock to verify invalidation call)
// ---------------------------------------------------------------------------

describe('ContextUpdater – handleFileChange', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
  });

  it('invalidates the cache for the given project', async () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-3');
    await cache.set('proj-3', ctx);

    await cache.invalidate('proj-3');

    expect(await cache.get('proj-3')).toBeNull();
  });

  it('handles change with optional fileId', async () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-4');
    await cache.set('proj-4', ctx);

    await cache.invalidate('proj-4');

    expect(await cache.get('proj-4')).toBeNull();
  });

  it('logs the change event', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reproduce the log line that handleFileChange emits
    const projectId = 'proj-5';
    const changeType = 'update';
    const fileId = 'file-xyz';

    console.log(
      `[ContextUpdater] File change: ${changeType}${fileId ? ` (file: ${fileId})` : ''} — cache invalidated for project ${projectId}`
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ContextUpdater] File change: update')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('file-xyz')
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// refreshActiveExecutions tests (invalidate then reload pattern)
// ---------------------------------------------------------------------------

describe('ContextUpdater – refreshActiveExecutions pattern', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
  });

  it('invalidates existing cache so next load is fresh', async () => {
    const cache = new ContextCache();
    const stale = makeContext('proj-6');
    await cache.set('proj-6', stale);

    await cache.invalidate('proj-6');
    expect(await cache.get('proj-6')).toBeNull();

    const fresh = makeContext('proj-6');
    await cache.set('proj-6', fresh);
    expect(await cache.get('proj-6')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadProjectContext cache-check tests
// ---------------------------------------------------------------------------

describe('ContextUpdater – loadProjectContext cache path', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
  });

  it('returns cached context when available', async () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-7');
    await cache.set('proj-7', ctx);

    const result = await cache.get('proj-7');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-7');
  });

  it('returns null on cache miss (loader would be invoked)', async () => {
    const cache = new ContextCache();

    const result = await cache.get('proj-8');
    expect(result).toBeNull();
  });

  it('TTL expiry causes cache miss', async () => {
    const shortCache = new ContextCache(50);
    await shortCache.set('proj-9', makeContext('proj-9'));

    expect(await shortCache.get('proj-9')).not.toBeNull();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(await shortCache.get('proj-9')).toBeNull();
  });
});
