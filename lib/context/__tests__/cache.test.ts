import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCache } from '../cache';
import type { ProjectContext } from '../types';

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
    cache = new ContextCache();
    vi.restoreAllMocks();
  });

  it('stores and retrieves context', () => {
    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    const result = cache.get('proj-1');
    expect(result).toEqual(ctx);
  });

  it('returns null for missing entries', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for expired entries', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    // Advance time past TTL (5 minutes = 300000ms)
    vi.spyOn(Date, 'now').mockReturnValue(now + 300_001);

    const result = cache.get('proj-1');
    expect(result).toBeNull();
  });

  it('returns context just before TTL expires', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    // Advance time to just under TTL
    vi.spyOn(Date, 'now').mockReturnValue(now + 299_999);

    const result = cache.get('proj-1');
    expect(result).toEqual(ctx);
  });

  it('invalidates a specific entry', () => {
    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    cache.invalidate('proj-1');

    const result = cache.get('proj-1');
    expect(result).toBeNull();
  });

  it('caches multiple projects independently', () => {
    const ctx1 = makeContext('proj-1');
    const ctx2 = makeContext('proj-2');
    cache.set('proj-1', ctx1);
    cache.set('proj-2', ctx2);

    expect(cache.get('proj-1')).toEqual(ctx1);
    expect(cache.get('proj-2')).toEqual(ctx2);

    cache.invalidate('proj-1');

    expect(cache.get('proj-1')).toBeNull();
    expect(cache.get('proj-2')).toEqual(ctx2);
  });

  it('tracks hits and misses', () => {
    const ctx = makeContext('proj-1');
    cache.set('proj-1', ctx);

    // 2 hits
    cache.get('proj-1');
    cache.get('proj-1');

    // 2 misses
    cache.get('nonexistent');
    cache.get('also-missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.size).toBe(1);
  });

  it('counts expired entry access as a miss', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    cache.set('proj-1', makeContext('proj-1'));

    vi.spyOn(Date, 'now').mockReturnValue(now + 300_001);

    cache.get('proj-1');

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it('clear removes all entries and resets stats', () => {
    cache.set('proj-1', makeContext('proj-1'));
    cache.set('proj-2', makeContext('proj-2'));

    // Generate some stats
    cache.get('proj-1');
    cache.get('nonexistent');

    cache.clear();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);

    expect(cache.get('proj-1')).toBeNull();
    expect(cache.get('proj-2')).toBeNull();
  });

  it('cleans expired entries on get()', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    cache.set('proj-old', makeContext('proj-old'));

    // Advance time so proj-old expires, then add a fresh entry
    vi.spyOn(Date, 'now').mockReturnValue(now + 300_001);
    cache.set('proj-new', makeContext('proj-new'));

    // Accessing proj-new triggers cleanup of expired entries
    cache.get('proj-new');

    const stats = cache.getStats();
    // proj-old should have been cleaned out
    expect(stats.size).toBe(1);
  });

  it('supports custom TTL', () => {
    const shortCache = new ContextCache(100); // 100ms TTL
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    shortCache.set('proj-1', makeContext('proj-1'));

    vi.spyOn(Date, 'now').mockReturnValue(now + 101);

    expect(shortCache.get('proj-1')).toBeNull();
  });
});
