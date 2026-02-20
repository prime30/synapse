/**
 * Client-safe stub for local-file-cache.
 * Used when webpack builds the client bundle so the real module (which uses Node `fs`)
 * is never pulled in. Server code uses the real local-file-cache.ts.
 */

export interface LocalFileEntry {
  fileId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  sizeBytes: number;
  cachedAt: string;
}

export interface LocalManifest {
  projectId: string;
  fileCount: number;
  lastSyncAt: string;
  files: LocalFileEntry[];
}

export function cacheFile(): void {
  // no-op on client
}

export function cacheThemeFiles(): void {
  // no-op on client
}

export function hasLocalCache(): boolean {
  return false;
}

export function loadManifest(): LocalManifest | null {
  return null;
}

export function readCachedFile(): string | null {
  return null;
}

export async function readCachedFilesByIds(): Promise<Map<string, string>> {
  return new Map();
}

export function clearLocalCache(): void {
  // no-op on client
}

export async function seedFromDirectory(): Promise<number> {
  return 0;
}
