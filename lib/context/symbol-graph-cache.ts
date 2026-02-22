import { createHash } from 'node:crypto';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';
import type { FileContext } from './types';

export interface SymbolGraph {
  byFile: Record<string, string[]>;
  reverseIndex: Record<string, string[]>;
  createdAt: string;
}

interface SymbolGraphResult {
  graph: SymbolGraph;
  cacheHit: boolean;
  fingerprint: string;
}

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function extractTokens(fileName: string, content: string): string[] {
  const tokens = new Set<string>();

  const fileNameParts = fileName
    .replace(/\\/g, '/')
    .split('/')
    .flatMap((part) => part.replace(/\.[a-z0-9]+$/i, '').split(/[-_.]/g))
    .map(normalizeToken)
    .filter((t) => t.length >= 3);
  for (const t of fileNameParts) tokens.add(t);

  const liquidRefs = content.match(/\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g) ?? [];
  for (const ref of liquidRefs) {
    const name = ref.replace(/.*['"]([^'"]+)['"].*/, '$1');
    for (const part of name.split(/[-_.]/g).map(normalizeToken)) {
      if (part.length >= 3) tokens.add(part);
    }
  }

  const classes = content.match(/class\s*=\s*["']([^"']+)["']/g) ?? [];
  for (const cls of classes) {
    const value = cls.replace(/class\s*=\s*["']/, '').replace(/["']$/, '');
    for (const part of value.split(/\s+/).map(normalizeToken)) {
      if (part.length >= 3) tokens.add(part);
    }
  }

  const settings = content.match(/(?:section|block)\.settings\.([a-zA-Z0-9_]+)/g) ?? [];
  for (const s of settings) {
    const key = s.split('.').pop();
    if (key && key.length >= 3) tokens.add(normalizeToken(key));
  }

  const localeKeys = content.match(/['"]([a-zA-Z0-9_.-]+)['"]\s*\|\s*t\b/g) ?? [];
  for (const lk of localeKeys) {
    const key = lk.replace(/['"]([a-zA-Z0-9_.-]+)['"].*/, '$1');
    for (const part of key.split(/[._-]/g).map(normalizeToken)) {
      if (part.length >= 3) tokens.add(part);
    }
  }

  return [...tokens];
}

function createSymbolGraph(files: FileContext[]): SymbolGraph {
  const byFile: Record<string, string[]> = {};
  const reverse: Record<string, Set<string>> = {};

  for (const file of files) {
    const filePath = file.fileName;
    const tokens = extractTokens(filePath, file.content);
    byFile[filePath] = tokens;
    for (const token of tokens) {
      if (!reverse[token]) reverse[token] = new Set<string>();
      reverse[token].add(filePath);
    }
  }

  const reverseIndex: Record<string, string[]> = {};
  for (const [token, fileSet] of Object.entries(reverse)) {
    reverseIndex[token] = [...fileSet];
  }

  return {
    byFile,
    reverseIndex,
    createdAt: new Date().toISOString(),
  };
}

export class SymbolGraphCache {
  private adapter: CacheAdapter;
  private ttlMs: number;
  private hot = new Map<string, { expiresAt: number; value: SymbolGraph }>();
  private hotLimit = 20;

  constructor(ttlMs = 300_000) {
    this.adapter = createNamespacedCache('symbol-graph');
    this.ttlMs = ttlMs;
  }

  private key(projectId: string, fingerprint: string): string {
    return `${projectId}:${fingerprint}`;
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

  private pruneHot(now = Date.now()): void {
    for (const [k, v] of this.hot.entries()) {
      if (v.expiresAt <= now) this.hot.delete(k);
    }
    if (this.hot.size <= this.hotLimit) return;
    const ordered = [...this.hot.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < ordered.length - this.hotLimit; i++) {
      this.hot.delete(ordered[i][0]);
    }
  }

  async getOrCompute(projectId: string, files: FileContext[]): Promise<SymbolGraphResult> {
    const fingerprint = this.buildFingerprint(files);
    const key = this.key(projectId, fingerprint);
    const now = Date.now();
    this.pruneHot(now);

    const hotEntry = this.hot.get(key);
    if (hotEntry && hotEntry.expiresAt > now) {
      return { graph: hotEntry.value, cacheHit: true, fingerprint };
    }

    const cached = await this.adapter.get<SymbolGraph>(key);
    if (cached) {
      this.hot.set(key, { expiresAt: now + this.ttlMs, value: cached });
      return { graph: cached, cacheHit: true, fingerprint };
    }

    const graph = createSymbolGraph(files);
    this.hot.set(key, { expiresAt: now + this.ttlMs, value: graph });
    await this.adapter.set(key, graph, this.ttlMs);
    return { graph, cacheHit: false, fingerprint };
  }

  lookupFiles(graph: SymbolGraph, query: string, limit = 12): string[] {
    const terms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s_.-]/g, ' ')
      .split(/\s+/)
      .map(normalizeToken)
      .filter((t) => t.length >= 3);

    const scores = new Map<string, number>();
    for (const term of terms) {
      const files = graph.reverseIndex[term] ?? [];
      for (const file of files) {
        scores.set(file, (scores.get(file) ?? 0) + 1);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file]) => file);
  }

  async invalidateProject(projectId: string): Promise<void> {
    for (const key of this.hot.keys()) {
      if (key.startsWith(`${projectId}:`)) this.hot.delete(key);
    }
    await this.adapter.invalidatePattern(`${projectId}:*`);
  }
}
