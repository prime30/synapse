/**
 * Local filesystem cache for theme files.
 *
 * After a theme is imported from Shopify (via pullTheme), files are written
 * to disk at `.cache/themes/{projectId}/{filePath}`. On subsequent agent runs,
 * loadContent checks local disk first — eliminating Supabase round-trips and
 * matching Cursor's local-read latency profile.
 *
 * Cache layout:
 *   .cache/themes/{projectId}/
 *     _manifest.json          ← file metadata index
 *     sections/header.liquid   ← actual file content
 *     assets/theme.css         ← actual file content
 */

import fs from 'node:fs';
import path from 'node:path';

const CACHE_ROOT = path.join(process.cwd(), '.cache', 'themes');

// ── Helpers ─────────────────────────────────

function projectDir(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_ROOT, safe);
}

function manifestPath(projectId: string): string {
  return path.join(projectDir(projectId), '_manifest.json');
}

function localFilePath(projectId: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/\.\./g, '');
  return path.join(projectDir(projectId), normalized);
}

// ── Types ──────────────────────────────────

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

// ── Write ──────────────────────────────────

/** Write a single file to the local cache. */
export function cacheFile(
  projectId: string,
  _fileId: string,
  fileName: string,
  relativePath: string,
  _fileType: string,
  content: string,
): void {
  const dest = localFilePath(projectId, relativePath || fileName);
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, content, 'utf-8');
}

/** Write all files + manifest after theme sync. Replaces entire project cache. */
export function cacheThemeFiles(
  projectId: string,
  files: Array<{
    fileId: string;
    fileName: string;
    path: string;
    fileType: string;
    content: string;
  }>,
): void {
  const dir = projectDir(projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  const entries: LocalFileEntry[] = [];
  for (const file of files) {
    const rel = file.path || file.fileName;
    cacheFile(projectId, file.fileId, file.fileName, rel, file.fileType, file.content);
    entries.push({
      fileId: file.fileId,
      fileName: file.fileName,
      filePath: rel,
      fileType: file.fileType,
      sizeBytes: Buffer.byteLength(file.content, 'utf-8'),
      cachedAt: new Date().toISOString(),
    });
  }

  const manifest: LocalManifest = {
    projectId,
    fileCount: entries.length,
    lastSyncAt: new Date().toISOString(),
    files: entries,
  };
  fs.writeFileSync(manifestPath(projectId), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[local-file-cache] Cached ${entries.length} files for project ${projectId}`);
}

/** Update a single file in the local cache and sync the manifest. */
export function updateCachedFile(
  projectId: string,
  fileId: string,
  fileName: string,
  relativePath: string,
  fileType: string,
  content: string,
): void {
  cacheFile(projectId, fileId, fileName, relativePath, fileType, content);

  const manifest = loadManifest(projectId);
  if (!manifest) return;

  const entry: LocalFileEntry = {
    fileId,
    fileName,
    filePath: relativePath || fileName,
    fileType,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    cachedAt: new Date().toISOString(),
  };

  const idx = manifest.files.findIndex(f => f.fileId === fileId);
  if (idx >= 0) {
    manifest.files[idx] = entry;
  } else {
    manifest.files.push(entry);
    manifest.fileCount = manifest.files.length;
  }
  manifest.lastSyncAt = new Date().toISOString();
  fs.writeFileSync(manifestPath(projectId), JSON.stringify(manifest, null, 2), 'utf-8');
}

/** Remove a file from the local cache and sync the manifest. */
export function deleteCachedFile(projectId: string, fileId: string): void {
  const manifest = loadManifest(projectId);
  if (!manifest) return;

  const entry = manifest.files.find(f => f.fileId === fileId);
  if (!entry) return;

  const fp = localFilePath(projectId, entry.filePath);
  try { fs.unlinkSync(fp); } catch { /* file may not exist on disk */ }

  manifest.files = manifest.files.filter(f => f.fileId !== fileId);
  manifest.fileCount = manifest.files.length;
  manifest.lastSyncAt = new Date().toISOString();
  fs.writeFileSync(manifestPath(projectId), JSON.stringify(manifest, null, 2), 'utf-8');
}

// ── Read ───────────────────────────────────

/** Check if local cache exists for a project. */
export function hasLocalCache(projectId: string): boolean {
  return fs.existsSync(manifestPath(projectId));
}

/** Load manifest. Returns null if no cache. */
export function loadManifest(projectId: string): LocalManifest | null {
  const mp = manifestPath(projectId);
  if (!fs.existsSync(mp)) return null;
  try {
    return JSON.parse(fs.readFileSync(mp, 'utf-8')) as LocalManifest;
  } catch {
    return null;
  }
}

/** Read a single file from local cache. Returns null if not found. */
export function readCachedFile(projectId: string, relativePath: string): string | null {
  const fp = localFilePath(projectId, relativePath);
  if (!fs.existsSync(fp)) return null;
  try {
    return fs.readFileSync(fp, 'utf-8');
  } catch {
    return null;
  }
}

/** Read multiple files by ID from local cache. */
export function readCachedFilesByIds(
  projectId: string,
  fileIds: string[],
): Map<string, string> {
  const manifest = loadManifest(projectId);
  if (!manifest) return new Map();

  const idToPath = new Map<string, string>();
  for (const entry of manifest.files) {
    idToPath.set(entry.fileId, entry.filePath);
  }

  const result = new Map<string, string>();
  for (const fid of fileIds) {
    const rel = idToPath.get(fid);
    if (!rel) continue;
    const content = readCachedFile(projectId, rel);
    if (content !== null) {
      result.set(fid, content);
    }
  }
  return result;
}

// ── Invalidation ───────────────────────────

/** Remove the entire local cache for a project. */
export function clearLocalCache(projectId: string): void {
  const dir = projectDir(projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[local-file-cache] Cleared cache for project ${projectId}`);
  }
}

// ── Seeding (dev/test) ─────────────────────

function defaultFileType(ext: string): string {
  if (ext === 'liquid') return 'liquid';
  if (ext === 'js') return 'javascript';
  if (ext === 'css' || ext === 'scss') return 'css';
  if (ext === 'json') return 'json';
  return 'other';
}

/** Seed the local cache from a directory (e.g., theme-workspace/). */
export function seedFromDirectory(
  projectId: string,
  sourceDir: string,
  fileTypeFn: (ext: string) => string = defaultFileType,
): void {
  const files: Array<{
    fileId: string;
    fileName: string;
    path: string;
    fileType: string;
    content: string;
  }> = [];

  function walk(dir: string, prefix: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
      } else {
        const ext = path.extname(entry.name).slice(1);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({
            fileId: `local-${relativePath.replace(/[\/\\]/g, '-')}`,
            fileName: entry.name,
            path: relativePath,
            fileType: fileTypeFn(ext),
            content,
          });
        } catch {
          // skip binary files
        }
      }
    }
  }

  walk(sourceDir, '');
  cacheThemeFiles(projectId, files);
}
