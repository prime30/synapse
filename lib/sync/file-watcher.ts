/**
 * FileWatcher — Watches .synapse-themes/ for local changes and pushes
 * them to Supabase via the file service layer.
 *
 * Started by instrumentation.ts in dev mode. Uses chokidar for cross-
 * platform file watching with debounce (awaitWriteFinish).
 *
 * Echo prevention: checks isBeingWritten() from disk-sync.ts before
 * pushing, so writes originating from Cloud-to-Disk don't echo back.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import { isBeingWritten, getThemesRoot, isLocalSyncEnabled } from './disk-sync';

// ── Types ──────────────────────────────────────────────────────────────

interface SynapseMeta {
  projectId: string;
  projectSlug: string;
  lastSyncedAt: string;
}

// ── State ──────────────────────────────────────────────────────────────

let watcher: FSWatcher | null = null;

// Cache: projectSlug → { projectId, fileMap: path → fileId }
const projectCache = new Map<
  string,
  { meta: SynapseMeta; fileMap: Map<string, string> | null }
>();

// ── Helpers ────────────────────────────────────────────────────────────

const META_FILENAME = '.synapse-meta.json';
const IGNORED_PATTERNS = [
  META_FILENAME,
  '**/.synapse-backup',
  '**/.tmp-*',
  '**/node_modules/**',
  '**/.git/**',
];

/** Detect file type from extension (matches lib/types/files.ts FileType union). */
function detectFileType(filePath: string): 'liquid' | 'javascript' | 'css' | 'other' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.liquid') return 'liquid';
  if (['.js', '.ts', '.jsx', '.tsx', '.mjs'].includes(ext)) return 'javascript';
  if (['.css', '.scss', '.sass'].includes(ext)) return 'css';
  return 'other';
}

/** Parse the project slug from an absolute path under .synapse-themes/. */
function parseProjectSlug(filePath: string): string | null {
  const themesRoot = getThemesRoot();
  if (!filePath.startsWith(themesRoot)) return null;
  const relative = filePath.slice(themesRoot.length + 1); // strip root + separator
  const firstSep = relative.indexOf(path.sep);
  if (firstSep === -1) return relative; // file directly in project dir
  return relative.slice(0, firstSep);
}

/** Get the theme-relative file path (e.g., "templates/product.liquid"). */
function getRelativeThemePath(filePath: string, projectSlug: string): string {
  const projectDir = path.join(getThemesRoot(), projectSlug);
  return filePath
    .slice(projectDir.length + 1)
    .replace(/\\/g, '/'); // normalize to forward slashes
}

/** Read and cache .synapse-meta.json for a project directory. */
async function getProjectMeta(projectSlug: string): Promise<SynapseMeta | null> {
  const cached = projectCache.get(projectSlug);
  if (cached) return cached.meta;

  try {
    const metaPath = path.join(getThemesRoot(), projectSlug, META_FILENAME);
    const raw = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as SynapseMeta;
    projectCache.set(projectSlug, { meta, fileMap: null });
    return meta;
  } catch {
    return null;
  }
}

/** Lazy-load the file map (path → fileId) for a project. */
async function getFileMap(
  projectSlug: string,
  projectId: string,
): Promise<Map<string, string>> {
  const cached = projectCache.get(projectSlug);
  if (cached?.fileMap) return cached.fileMap;

  try {
    // Use the service role client directly to avoid auth overhead
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await supabase
      .from('files')
      .select('id, path')
      .eq('project_id', projectId);

    const map = new Map<string, string>();
    for (const f of data ?? []) {
      map.set(f.path, f.id);
    }

    const entry = projectCache.get(projectSlug);
    if (entry) {
      entry.fileMap = map;
    }
    return map;
  } catch (err) {
    console.warn('[FileWatcher] Failed to load file map:', err);
    return new Map();
  }
}

/** Invalidate a project's file map cache (e.g., after adding a new file). */
function invalidateFileMap(projectSlug: string): void {
  const entry = projectCache.get(projectSlug);
  if (entry) entry.fileMap = null;
}

// ── Event handlers ─────────────────────────────────────────────────────

async function handleFileChange(filePath: string): Promise<void> {
  // Skip echo'd writes from DiskSync
  if (isBeingWritten(filePath)) return;

  const projectSlug = parseProjectSlug(filePath);
  if (!projectSlug) return;

  const meta = await getProjectMeta(projectSlug);
  if (!meta) {
    console.warn(`[FileWatcher] No .synapse-meta.json for ${projectSlug}, skipping`);
    return;
  }

  const relativePath = getRelativeThemePath(filePath, projectSlug);
  if (!relativePath || relativePath === META_FILENAME) return;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileMap = await getFileMap(projectSlug, meta.projectId);
    const fileId = fileMap.get(relativePath);

    if (fileId) {
      // Existing file — update content
      const { updateFile } = await import('@/lib/services/files');
      await updateFile(fileId, { content });
      console.log(`[FileWatcher] Updated: ${relativePath}`);
    } else {
      // New file — create
      const { createFile } = await import('@/lib/services/files');
      const fileName = path.basename(relativePath);
      await createFile({
        project_id: meta.projectId,
        name: fileName,
        path: relativePath,
        file_type: detectFileType(relativePath),
        content,
        created_by: 'local-sync',
      });
      invalidateFileMap(projectSlug);
      console.log(`[FileWatcher] Created: ${relativePath}`);
    }
  } catch (err) {
    console.warn(`[FileWatcher] Failed to sync ${relativePath}:`, err);
  }
}

async function handleFileDelete(filePath: string): Promise<void> {
  // Skip echo'd deletes from DiskSync
  if (isBeingWritten(filePath)) return;

  const projectSlug = parseProjectSlug(filePath);
  if (!projectSlug) return;

  const relativePath = getRelativeThemePath(filePath, projectSlug);
  if (!relativePath || relativePath === META_FILENAME) return;

  // Log only — do NOT auto-delete from Supabase (too dangerous)
  console.log(`[FileWatcher] Local delete detected (not synced): ${relativePath}`);
}

// ── Lifecycle ──────────────────────────────────────────────────────────

export function startFileWatcher(): void {
  if (!isLocalSyncEnabled()) {
    console.log('[FileWatcher] Local sync disabled, skipping watcher');
    return;
  }

  if (watcher) {
    console.warn('[FileWatcher] Watcher already running');
    return;
  }

  const themesRoot = getThemesRoot();

  // Ensure the themes root directory exists
  import('fs').then((fsSync) => {
    if (!fsSync.existsSync(themesRoot)) {
      fsSync.mkdirSync(themesRoot, { recursive: true });
    }
  });

  // Dynamic import to keep chokidar out of production bundles
  import('chokidar').then((chokidar) => {
    const watchPath = path.join(themesRoot, '**', '*');

    watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      ignored: IGNORED_PATTERNS.map((p) =>
        p.startsWith('**/') ? p : path.join(themesRoot, '**', p),
      ),
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // Don't follow symlinks to avoid infinite loops
      followSymlinks: false,
    });

    watcher.on('change', (fp) => {
      handleFileChange(fp as string).catch((err) =>
        console.warn('[FileWatcher] change handler error:', err),
      );
    });

    watcher.on('add', (fp) => {
      handleFileChange(fp as string).catch((err) =>
        console.warn('[FileWatcher] add handler error:', err),
      );
    });

    watcher.on('unlink', (fp) => {
      handleFileDelete(fp as string).catch((err) =>
        console.warn('[FileWatcher] unlink handler error:', err),
      );
    });

    watcher.on('error', (err) => {
      console.warn('[FileWatcher] Watcher error:', err);
    });

    console.log(`[FileWatcher] Watching ${themesRoot}`);
  }).catch((err) => {
    console.warn('[FileWatcher] Failed to start watcher (chokidar):', err);
  });
}

export function stopFileWatcher(): void {
  if (watcher) {
    watcher.close().catch(() => {});
    watcher = null;
    projectCache.clear();
    console.log('[FileWatcher] Stopped');
  }
}
