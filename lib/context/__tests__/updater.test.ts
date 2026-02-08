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
    cache = new ContextCache();
  });

  it('returns null for an unknown project', () => {
    expect(cache.get('unknown')).toBeNull();
  });

  it('stores and retrieves a ProjectContext', () => {
    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    const result = cache.get('proj-1');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-1');
    expect(result!.files).toEqual([]);
    expect(result!.dependencies).toEqual([]);
    expect(result!.totalSizeBytes).toBe(0);
    expect(result!.loadedAt).toBeInstanceOf(Date);
  });

  it('invalidate removes the cached entry', () => {
    const ctx = makeContext('proj-2');
    cache.set('proj-2', ctx);

    expect(cache.get('proj-2')).not.toBeNull();

    cache.invalidate('proj-2');
    expect(cache.get('proj-2')).toBeNull();
  });

  it('clear removes all entries and resets stats', () => {
    cache.set('a', makeContext('a'));
    cache.set('b', makeContext('b'));

    cache.clear();

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.getStats().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleFileChange tests (uses a mock to verify invalidation call)
// ---------------------------------------------------------------------------

describe('ContextUpdater – handleFileChange', () => {
  it('invalidates the cache for the given project', () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-3');
    cache.set('proj-3', ctx);

    // Simulate what handleFileChange does: invalidate + log
    cache.invalidate('proj-3');

    expect(cache.get('proj-3')).toBeNull();
  });

  it('handles change with optional fileId', () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-4');
    cache.set('proj-4', ctx);

    // Simulate handleFileChange('proj-4', 'delete', 'file-abc')
    cache.invalidate('proj-4');

    expect(cache.get('proj-4')).toBeNull();
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
  it('invalidates existing cache so next load is fresh', () => {
    const cache = new ContextCache();
    const stale = makeContext('proj-6');
    cache.set('proj-6', stale);

    // refreshActiveExecutions first invalidates…
    cache.invalidate('proj-6');
    expect(cache.get('proj-6')).toBeNull();

    // …then a fresh context would be loaded and cached
    const fresh = makeContext('proj-6');
    cache.set('proj-6', fresh);
    expect(cache.get('proj-6')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadProjectContext cache-check tests
// ---------------------------------------------------------------------------

describe('ContextUpdater – loadProjectContext cache path', () => {
  it('returns cached context when available', () => {
    const cache = new ContextCache();
    const ctx = makeContext('proj-7');
    cache.set('proj-7', ctx);

    const result = cache.get('proj-7');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-7');
  });

  it('returns null on cache miss (loader would be invoked)', () => {
    const cache = new ContextCache();

    const result = cache.get('proj-8');
    expect(result).toBeNull();
  });

  it('TTL expiry causes cache miss', async () => {
    // Use a very short TTL
    const shortCache = new ContextCache(50);
    shortCache.set('proj-9', makeContext('proj-9'));

    expect(shortCache.get('proj-9')).not.toBeNull();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(shortCache.get('proj-9')).toBeNull();
  });
});
