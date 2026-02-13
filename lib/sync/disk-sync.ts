/**
 * DiskSync — Mirrors Supabase project files to the local filesystem.
 *
 * All functions are no-ops unless NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1'.
 * This module handles only filesystem writes — it never touches Supabase.
 * Callers are responsible for fetching content (including from Supabase
 * Storage for files >= 100 KB) before invoking these functions.
 *
 * Directory layout:
 *   .synapse-themes/{projectId_8}-{slug}/
 *     .synapse-meta.json          ← { projectId, projectSlug, lastSyncedAt }
 *     templates/product.liquid
 *     sections/header.liquid
 *     assets/theme.css
 *     ...
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// ── Constants ──────────────────────────────────────────────────────────

const THEMES_ROOT_DIR = '.synapse-themes';
const META_FILENAME = '.synapse-meta.json';
const ECHO_TTL_MS = 2_000; // 2-second echo prevention window
const SLUG_CACHE_MAX = 50;

// ── Echo prevention ────────────────────────────────────────────────────
// Shared between DiskSync writes and the file watcher reads.
// Key = absolute file path, Value = timestamp when marked.

const writingPaths = new Map<string, number>();

export function markWriting(fullPath: string): void {
  writingPaths.set(fullPath, Date.now());
}

export function isBeingWritten(fullPath: string): boolean {
  const ts = writingPaths.get(fullPath);
  if (!ts) return false;
  if (Date.now() - ts > ECHO_TTL_MS) {
    writingPaths.delete(fullPath);
    return false;
  }
  return true;
}

// Periodic cleanup of stale entries (runs every 10 s)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [p, ts] of writingPaths) {
      if (now - ts > ECHO_TTL_MS) writingPaths.delete(p);
    }
  }, 10_000).unref?.();
}

// ── Dev-mode guard ─────────────────────────────────────────────────────

export function isLocalSyncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_LOCAL_SYNC === '1';
}

// ── Slug helpers ───────────────────────────────────────────────────────

/**
 * Build a filesystem-safe slug from a project ID + name.
 *   "feb2ce01-4edd-4ebc-..." + "Dawn Live" → "feb2ce01-dawn-live"
 */
export function sanitizeProjectSlug(projectId: string, projectName: string): string {
  const prefix = projectId.replace(/-/g, '').slice(0, 8);
  const slug = projectName
    .toLowerCase()
    .replace(/[<>:"|?*\\\/]+/g, '') // strip Windows-unsafe chars
    .replace(/[^a-z0-9]+/g, '-')    // collapse non-alphanum to dashes
    .replace(/^-+|-+$/g, '');       // trim leading/trailing dashes
  return `${prefix}-${slug || 'project'}`;
}

// Module-level LRU cache: projectId → slug
const slugCache = new Map<string, string>();

/**
 * Resolve a project's filesystem slug by querying the DB.
 * Cached per-process to avoid repeated lookups on every file save.
 */
export async function resolveProjectSlug(projectId: string): Promise<string> {
  const cached = slugCache.get(projectId);
  if (cached) return cached;

  try {
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();

    const name = data?.name ?? 'unnamed';
    const slug = sanitizeProjectSlug(projectId, name);

    // Evict oldest entry if cache is full
    if (slugCache.size >= SLUG_CACHE_MAX) {
      const oldest = slugCache.keys().next().value;
      if (oldest) slugCache.delete(oldest);
    }
    slugCache.set(projectId, slug);
    return slug;
  } catch (err) {
    console.warn('[DiskSync] Failed to resolve project slug:', err);
    return sanitizeProjectSlug(projectId, 'unnamed');
  }
}

// ── Path helpers ───────────────────────────────────────────────────────

/** Returns the workspace root (where .synapse-themes/ lives). */
function getWorkspaceRoot(): string {
  // In dev, process.cwd() is the Next.js project root.
  return process.cwd();
}

/** Returns the absolute path to .synapse-themes/ */
export function getThemesRoot(): string {
  return path.join(getWorkspaceRoot(), THEMES_ROOT_DIR);
}

/** Returns the absolute path for a project's local theme directory. */
export function getLocalThemePath(projectSlug: string): string {
  return path.join(getThemesRoot(), projectSlug);
}

/** Returns the absolute path for a specific file within a project. */
function getLocalFilePath(projectSlug: string, filePath: string): string {
  // Normalize forward slashes to OS path separator and prevent traversal
  const normalized = filePath.replace(/\\/g, '/').replace(/\.\./g, '');
  return path.join(getLocalThemePath(projectSlug), normalized);
}

// ── Atomic write helper ────────────────────────────────────────────────

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  // Write to temp file, then rename (atomic on most filesystems)
  const tmpPath = path.join(
    os.tmpdir(),
    `synapse-${Date.now()}-${path.basename(targetPath)}`,
  );
  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, targetPath);
  } catch (renameErr) {
    // Cross-device rename fails on some setups; fall back to copy + delete
    try {
      await fs.copyFile(tmpPath, targetPath);
      await fs.unlink(tmpPath).catch(() => {});
    } catch {
      // Last resort: direct write
      await fs.writeFile(targetPath, content, 'utf-8');
    }
  }
}

// ── Core API ───────────────────────────────────────────────────────────

/**
 * Write a single file to the local theme directory.
 * Fire-and-forget safe — errors are logged, never thrown.
 */
export async function writeFileToDisk(
  projectSlug: string,
  filePath: string,
  content: string,
): Promise<void> {
  if (!isLocalSyncEnabled()) return;
  try {
    const fullPath = getLocalFilePath(projectSlug, filePath);
    markWriting(fullPath);
    await atomicWrite(fullPath, content);
  } catch (err) {
    console.warn(`[DiskSync] writeFileToDisk failed for ${filePath}:`, err);
  }
}

/**
 * Bulk-write an array of files. Writes .synapse-meta.json alongside them.
 * Does NOT delete existing files — only overwrites matching paths.
 */
export async function writeAllFilesToDisk(
  projectSlug: string,
  projectId: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  if (!isLocalSyncEnabled()) return;
  try {
    const themeDir = getLocalThemePath(projectSlug);
    await fs.mkdir(themeDir, { recursive: true });

    // Write meta file
    const meta = {
      projectId,
      projectSlug,
      lastSyncedAt: new Date().toISOString(),
      fileCount: files.length,
    };
    const metaPath = path.join(themeDir, META_FILENAME);
    markWriting(metaPath);
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    // Write all files (parallel with concurrency limit)
    const CONCURRENCY = 20;
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (f) => {
          const fullPath = getLocalFilePath(projectSlug, f.path);
          markWriting(fullPath);
          await atomicWrite(fullPath, f.content);
        }),
      );
    }

    console.log(`[DiskSync] Wrote ${files.length} files to ${themeDir}`);
  } catch (err) {
    console.warn('[DiskSync] writeAllFilesToDisk failed:', err);
  }
}

/**
 * Delete a single file from the local theme directory.
 * Prunes empty parent directories up to the project root.
 */
export async function deleteFileFromDisk(
  projectSlug: string,
  filePath: string,
): Promise<void> {
  if (!isLocalSyncEnabled()) return;
  try {
    const fullPath = getLocalFilePath(projectSlug, filePath);
    markWriting(fullPath);
    await fs.unlink(fullPath).catch(() => {});

    // Prune empty parent dirs up to the project root
    const projectRoot = getLocalThemePath(projectSlug);
    let dir = path.dirname(fullPath);
    while (dir !== projectRoot && dir.startsWith(projectRoot)) {
      const entries = await fs.readdir(dir);
      if (entries.length === 0) {
        await fs.rmdir(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    }
  } catch (err) {
    console.warn(`[DiskSync] deleteFileFromDisk failed for ${filePath}:`, err);
  }
}

/**
 * Rename a file on disk (delete old path, write new path).
 */
export async function renameFileOnDisk(
  projectSlug: string,
  oldPath: string,
  newPath: string,
  content: string,
): Promise<void> {
  if (!isLocalSyncEnabled()) return;
  try {
    await deleteFileFromDisk(projectSlug, oldPath);
    await writeFileToDisk(projectSlug, newPath, content);
  } catch (err) {
    console.warn(`[DiskSync] renameFileOnDisk failed for ${oldPath} → ${newPath}:`, err);
  }
}
