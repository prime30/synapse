import { createHash } from 'node:crypto';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';
import type { FileContext, FileDependency } from './types';

interface CachedDependencyGraph {
  dependencies: FileDependency[];
  createdAt: string;
}

interface DependencyCacheResult {
  dependencies: FileDependency[];
  cacheHit: boolean;
  fingerprint: string;
}

interface IncrementalDependencyCacheResult {
  dependencies: FileDependency[];
  cacheHit: boolean;
}

export class DependencyGraphCache {
  private adapter: CacheAdapter;
  private ttlMs: number;
  private hot = new Map<string, { expiresAt: number; value: CachedDependencyGraph }>();
  private hotLimit = 20;

  constructor(ttlMs = 300_000) {
    this.adapter = createNamespacedCache('dep-graph');
    this.ttlMs = ttlMs;
  }

  buildFingerprint(files: FileContext[]): string {
    const hash = createHash('sha1');
    const sorted = [...files].sort((a, b) => a.fileName.localeCompare(b.fileName));
    for (const f of sorted) {
      hash.update(f.fileName);
      hash.update(':');
      hash.update(String(f.content.length));
      hash.update(':');
      hash.update(f.content.slice(0, 64));
      hash.update(':');
      hash.update(f.content.slice(-64));
      hash.update('|');
    }
    return hash.digest('hex');
  }

  private key(projectId: string, fingerprint: string): string {
    return `${projectId}:${fingerprint}`;
  }

  private fileKey(projectId: string, fileId: string, fingerprint: string): string {
    return `f:${projectId}:${fileId}:${fingerprint}`;
  }

  private buildFileFingerprint(file: FileContext): string {
    const hash = createHash('sha1');
    hash.update(file.fileName);
    hash.update(':');
    hash.update(String(file.content.length));
    hash.update(':');
    hash.update(file.content.slice(0, 64));
    hash.update(':');
    hash.update(file.content.slice(-64));
    return hash.digest('hex');
  }

  private pruneHot(now = Date.now()): void {
    for (const [k, v] of this.hot.entries()) {
      if (v.expiresAt <= now) this.hot.delete(k);
    }
    if (this.hot.size <= this.hotLimit) return;
    const oldest = [...this.hot.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - this.hotLimit; i++) {
      this.hot.delete(oldest[i][0]);
    }
  }

  async getOrCompute(
    projectId: string,
    files: FileContext[],
    compute: () => FileDependency[],
  ): Promise<DependencyCacheResult> {
    const fingerprint = this.buildFingerprint(files);
    const cacheKey = this.key(projectId, fingerprint);
    const now = Date.now();
    this.pruneHot(now);

    const hotEntry = this.hot.get(cacheKey);
    if (hotEntry && hotEntry.expiresAt > now) {
      return { dependencies: hotEntry.value.dependencies, cacheHit: true, fingerprint };
    }

    const cached = await this.adapter.get<CachedDependencyGraph>(cacheKey);
    if (cached?.dependencies) {
      this.hot.set(cacheKey, {
        expiresAt: now + this.ttlMs,
        value: cached,
      });
      return { dependencies: cached.dependencies, cacheHit: true, fingerprint };
    }

    const dependencies = compute();
    const payload: CachedDependencyGraph = {
      dependencies,
      createdAt: new Date(now).toISOString(),
    };
    this.hot.set(cacheKey, { expiresAt: now + this.ttlMs, value: payload });
    await this.adapter.set(cacheKey, payload, this.ttlMs);
    return { dependencies, cacheHit: false, fingerprint };
  }

  async getOrComputeIncremental(
    projectId: string,
    files: FileContext[],
    computeForFile: (file: FileContext, allFiles: FileContext[]) => FileDependency[],
  ): Promise<IncrementalDependencyCacheResult> {
    const now = Date.now();
    this.pruneHot(now);

    let allHit = true;
    const allDeps: FileDependency[] = [];

    for (const file of files) {
      const fp = this.buildFileFingerprint(file);
      const cacheKey = this.fileKey(projectId, file.fileId, fp);
      const hotEntry = this.hot.get(cacheKey);
      if (hotEntry && hotEntry.expiresAt > now) {
        allDeps.push(...hotEntry.value.dependencies);
        continue;
      }

      const cached = await this.adapter.get<CachedDependencyGraph>(cacheKey);
      if (cached?.dependencies) {
        this.hot.set(cacheKey, {
          expiresAt: now + this.ttlMs,
          value: cached,
        });
        allDeps.push(...cached.dependencies);
        continue;
      }

      allHit = false;
      const deps = computeForFile(file, files);
      const payload: CachedDependencyGraph = {
        dependencies: deps,
        createdAt: new Date(now).toISOString(),
      };
      this.hot.set(cacheKey, { expiresAt: now + this.ttlMs, value: payload });
      await this.adapter.set(cacheKey, payload, this.ttlMs);
      allDeps.push(...deps);
    }

    return {
      dependencies: allDeps,
      cacheHit: allHit,
    };
  }

  async invalidateProject(projectId: string): Promise<void> {
    for (const key of this.hot.keys()) {
      if (key.startsWith(`${projectId}:`)) this.hot.delete(key);
    }
    await this.adapter.invalidatePattern(`${projectId}:*`);
  }

  async invalidateFiles(projectId: string, fileIds: string[]): Promise<void> {
    const fileSet = new Set(fileIds);
    for (const key of this.hot.keys()) {
      for (const fileId of fileSet) {
        if (key.includes(`:${projectId}:${fileId}:`)) {
          this.hot.delete(key);
        }
      }
    }
    for (const fileId of fileSet) {
      await this.adapter.invalidatePattern(`f:${projectId}:${fileId}:*`);
    }
  }
}
