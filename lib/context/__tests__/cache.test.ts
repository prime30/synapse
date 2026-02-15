import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCache } from '../cache';
import type { ProjectContext } from '../types';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';

function makeContext(projectId: string): ProjectContext {
  return {
    projectId,
    files: [],
    dependencies: [],
    loadedAt: new Date(),
    totalSizeBytes: 0,
  };
}

describe('ContextCache', () => {
  let cache: ContextCache;

  beforeEach(() => {
    // Use a fresh MemoryAdapter for each test
    setCacheAdapter(new MemoryAdapter());
    cache = new ContextCache();
    vi.restoreAllMocks();
  });

  it('stores and retrieves context', async () => {
    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    const result = await cache.get('proj-1');
    expect(result).toEqual(ctx);
  });

  it('returns null for missing entries', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for expired entries', async () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    // Advance time past TTL (5 minutes = 300000ms)
    vi.spyOn(Date, 'now').mockReturnValue(now + 300_001);

    const result = await cache.get('proj-1');
    expect(result).toBeNull();
  });

  it('returns context just before TTL expires', async () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    // Advance time to just under TTL
    vi.spyOn(Date, 'now').mockReturnValue(now + 299_999);

    const result = await cache.get('proj-1');
    expect(result).toEqual(ctx);
  });

  it('invalidates a specific entry', async () => {
    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    await cache.invalidate('proj-1');

    const result = await cache.get('proj-1');
    expect(result).toBeNull();
  });

  it('caches multiple projects independently', async () => {
    const ctx1 = makeContext('proj-1');
    const ctx2 = makeContext('proj-2');
    await cache.set('proj-1', ctx1);
    await cache.set('proj-2', ctx2);

    expect(await cache.get('proj-1')).toEqual(ctx1);
    expect(await cache.get('proj-2')).toEqual(ctx2);

    await cache.invalidate('proj-1');

    expect(await cache.get('proj-1')).toBeNull();
    expect(await cache.get('proj-2')).toEqual(ctx2);
  });

  it('tracks hits and misses', async () => {
    const ctx = makeContext('proj-1');
    await cache.set('proj-1', ctx);

    // 2 hits
    await cache.get('proj-1');
    await cache.get('proj-1');

    // 2 misses
    await cache.get('nonexistent');
    await cache.get('also-missing');

    const stats = await cache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(2);
    expect(stats.misses).toBeGreaterThanOrEqual(2);
  });

  it('clear removes all entries', async () => {
    await cache.set('proj-1', makeContext('proj-1'));
    await cache.set('proj-2', makeContext('proj-2'));

    await cache.clear();

    expect(await cache.get('proj-1')).toBeNull();
    expect(await cache.get('proj-2')).toBeNull();
  });
});
