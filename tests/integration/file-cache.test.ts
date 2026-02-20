/**
 * Tests for the lazy per-file content cache in file-loader.ts.
 *
 * Verifies:
 * - Second loadProjectFiles call returns cached metadata (no DB query)
 * - invalidateProjectFilesCache() clears the metadata cache
 * - loadContent fetches content on demand (async) with per-file caching
 * - invalidateFileContent() clears a single file's cached content
 * - invalidateAllProjectCaches() clears both metadata + content
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';

const PID = 'proj-cache-test-001';

// Fake Supabase rows returned by metadata query
const fakeMetaRows = [
  {
    id: 'f1',
    name: 'base.css',
    path: 'assets/base.css',
    file_type: 'css',
    size_bytes: 19,
  },
  {
    id: 'f2',
    name: 'product.liquid',
    path: 'sections/product.liquid',
    file_type: 'liquid',
    size_bytes: 30,
  },
];

// Fake content rows returned by loadFileContent query
const fakeContentRows = [
  { id: 'f1', content: 'body { margin: 0; }' },
  { id: 'f2', content: '<div>{{ product.title }}</div>' },
];

let metaQueryCount = 0;
let contentQueryCount = 0;

// Track which query type is in progress via .select() signature
let currentSelectColumns = '';

const mockClient = {
  from: () => ({
    select: (cols: string) => {
      currentSelectColumns = cols;
      return {
        eq: () => {
          if (currentSelectColumns.includes('size_bytes')) {
            metaQueryCount++;
            return Promise.resolve({ data: [...fakeMetaRows], error: null });
          }
          // content query fallback
          contentQueryCount++;
          return Promise.resolve({ data: [...fakeContentRows], error: null });
        },
        in: () => {
          contentQueryCount++;
          return Promise.resolve({ data: [...fakeContentRows], error: null });
        },
      };
    },
  }),
};

// Mock the Supabase createClient to return our mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => mockClient,
}));

describe('Project files cache — metadata layer', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    metaQueryCount = 0;
    contentQueryCount = 0;
  });

  afterEach(async () => {
    const { invalidateProjectFilesCache } = await import(
      '@/lib/supabase/file-loader'
    );
    await invalidateProjectFilesCache(PID);
    vi.restoreAllMocks();
  });

  it('first call hits DB for metadata, second call uses cache', async () => {
    const { loadProjectFiles } = await import('@/lib/supabase/file-loader');

    const result1 = await loadProjectFiles(PID);
    expect(result1.allFiles).toHaveLength(2);
    expect(metaQueryCount).toBe(1);

    const result2 = await loadProjectFiles(PID);
    expect(result2.allFiles).toHaveLength(2);
    expect(metaQueryCount).toBe(1); // still 1 — cache hit

    // Verify stubs contain size-based stub content, not real content
    for (const file of result2.allFiles) {
      expect(file.content).toMatch(/^\[\d+ chars\]$/);
    }
  });

  it('invalidation clears metadata cache and forces DB query', async () => {
    const { loadProjectFiles, invalidateProjectFilesCache } = await import(
      '@/lib/supabase/file-loader'
    );

    await loadProjectFiles(PID);
    expect(metaQueryCount).toBe(1);

    await invalidateProjectFilesCache(PID);

    await loadProjectFiles(PID);
    expect(metaQueryCount).toBe(2);
  });
});

describe('Project files cache — per-file content layer', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    metaQueryCount = 0;
    contentQueryCount = 0;
  });

  afterEach(async () => {
    const { invalidateProjectFilesCache, invalidateFileContent } = await import(
      '@/lib/supabase/file-loader'
    );
    await invalidateProjectFilesCache(PID);
    invalidateFileContent('f1');
    invalidateFileContent('f2');
    vi.restoreAllMocks();
  });

  it('loadContent fetches content on demand (async)', async () => {
    const { loadProjectFiles } = await import('@/lib/supabase/file-loader');

    const { loadContent } = await loadProjectFiles(PID);
    expect(contentQueryCount).toBe(0); // no content fetched yet

    const hydrated = await loadContent(['f1']);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].fileId).toBe('f1');
    expect(hydrated[0].content).toBe('body { margin: 0; }');
    expect(contentQueryCount).toBe(1);
  });

  it('second loadContent call uses per-file cache (no DB)', async () => {
    const { loadProjectFiles } = await import('@/lib/supabase/file-loader');

    const { loadContent } = await loadProjectFiles(PID);

    // First call — DB hit
    await loadContent(['f1']);
    expect(contentQueryCount).toBe(1);

    // Second call — should use per-file content cache
    const hydrated = await loadContent(['f1']);
    expect(hydrated[0].content).toBe('body { margin: 0; }');
    expect(contentQueryCount).toBe(1); // still 1 — cache hit
  });

  it('loadContent hydrates multiple files in a single batch', async () => {
    const { loadProjectFiles } = await import('@/lib/supabase/file-loader');

    const { loadContent } = await loadProjectFiles(PID);

    const hydrated = await loadContent(['f1', 'f2']);
    expect(hydrated).toHaveLength(2);
    expect(hydrated[0].content).toBe('body { margin: 0; }');
    expect(hydrated[1].content).toContain('product.title');
    expect(contentQueryCount).toBe(1); // single batch query
  });

  it('invalidateFileContent busts a single file cache entry', async () => {
    const { loadProjectFiles, invalidateFileContent } = await import(
      '@/lib/supabase/file-loader'
    );

    const { loadContent } = await loadProjectFiles(PID);

    // Warm the cache
    await loadContent(['f1', 'f2']);
    expect(contentQueryCount).toBe(1);

    // Invalidate only f1
    invalidateFileContent('f1');

    // Next call: f1 should need DB, f2 should be cached
    await loadContent(['f1', 'f2']);
    expect(contentQueryCount).toBe(2); // one more DB hit for f1
  });

  it('invalidateAllProjectCaches clears metadata and all content', async () => {
    const { loadProjectFiles, invalidateAllProjectCaches } = await import(
      '@/lib/supabase/file-loader'
    );

    // Warm both caches
    const { loadContent } = await loadProjectFiles(PID);
    await loadContent(['f1', 'f2']);
    expect(metaQueryCount).toBe(1);
    expect(contentQueryCount).toBe(1);

    // Nuke everything
    await invalidateAllProjectCaches(PID, ['f1', 'f2']);

    // Next loadProjectFiles should hit DB for metadata
    const { loadContent: lc2 } = await loadProjectFiles(PID);
    expect(metaQueryCount).toBe(2);

    // And loadContent should hit DB for content again
    await lc2(['f1']);
    expect(contentQueryCount).toBe(2);
  });
});
