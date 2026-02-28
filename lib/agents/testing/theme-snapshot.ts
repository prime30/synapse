/**
 * Theme Snapshot — capture and restore project file state for canary testing.
 *
 * Uses UPDATE-based reset (not DELETE+INSERT) to preserve file IDs and avoid
 * orphaning file_versions, file_embeddings, and Supabase Storage objects.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { invalidateAllProjectCaches } from '@/lib/supabase/file-loader';
import { invalidate as invalidateThemeMap } from '@/lib/agents/theme-map/cache';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface ThemeSnapshot {
  projectId: string;
  files: Array<{
    id: string;
    name: string;
    path: string;
    fileType: string;
    content: string;
  }>;
  takenAt: string;
}

/**
 * Capture the current state of all project files as a snapshot.
 * Skips files with storage_path (binary/large assets > 100KB).
 */
export async function takeSnapshot(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ThemeSnapshot> {
  const { data: files, error } = await supabase
    .from('files')
    .select('id, name, path, file_type, content')
    .eq('project_id', projectId)
    .is('storage_path', null)
    .order('path', { ascending: true });

  if (error) throw new Error(`takeSnapshot failed: ${error.message}`);
  if (!files || files.length === 0) throw new Error(`No files found for project ${projectId}`);

  return {
    projectId,
    files: files.map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      fileType: f.file_type,
      content: f.content ?? '',
    })),
    takenAt: new Date().toISOString(),
  };
}

/**
 * Reset all project files to the snapshot state.
 *
 * Strategy:
 * 1. Query current files in DB
 * 2. Files in snapshot but not in DB -> INSERT (agent deleted a file)
 * 3. Files in DB but not in snapshot -> DELETE (agent created a file)
 * 4. Files in both -> UPDATE content to snapshot version
 * 5. Invalidate all caches
 */
export async function resetToSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  snapshot: ThemeSnapshot,
): Promise<{ updated: number; inserted: number; deleted: number }> {
  const { data: currentFiles, error } = await supabase
    .from('files')
    .select('id, path')
    .eq('project_id', projectId)
    .is('storage_path', null);

  if (error) throw new Error(`resetToSnapshot query failed: ${error.message}`);

  const currentByPath = new Map((currentFiles ?? []).map(f => [f.path, f.id]));
  const snapshotByPath = new Map(snapshot.files.map(f => [f.path, f]));

  let updated = 0;
  let inserted = 0;
  let deleted = 0;

  // UPDATE: files that exist in both — overwrite content
  for (const snapFile of snapshot.files) {
    const existingId = currentByPath.get(snapFile.path);
    if (existingId) {
      const { error: updateErr } = await supabase
        .from('files')
        .update({ content: snapFile.content })
        .eq('id', existingId);
      if (updateErr) console.warn(`[snapshot] Failed to update ${snapFile.path}: ${updateErr.message}`);
      else updated++;
    }
  }

  // INSERT: files in snapshot but missing from DB (agent deleted them)
  for (const snapFile of snapshot.files) {
    if (!currentByPath.has(snapFile.path)) {
      const { error: insertErr } = await supabase
        .from('files')
        .insert({
          project_id: projectId,
          name: snapFile.name,
          path: snapFile.path,
          file_type: snapFile.fileType,
          content: snapFile.content,
        });
      if (insertErr) console.warn(`[snapshot] Failed to insert ${snapFile.path}: ${insertErr.message}`);
      else inserted++;
    }
  }

  // DELETE: files in DB but not in snapshot (agent created them)
  for (const [path, id] of currentByPath) {
    if (!snapshotByPath.has(path)) {
      const { error: deleteErr } = await supabase
        .from('files')
        .delete()
        .eq('id', id);
      if (deleteErr) console.warn(`[snapshot] Failed to delete ${path}: ${deleteErr.message}`);
      else deleted++;
    }
  }

  // Invalidate caches
  await invalidateCaches(projectId, snapshot.files.map(f => f.id));

  return { updated, inserted, deleted };
}

/**
 * Invalidate all project caches: file loader, theme map memory, and theme map disk.
 */
export async function invalidateCaches(projectId: string, fileIds: string[]): Promise<void> {
  await invalidateAllProjectCaches(projectId, fileIds);
  invalidateThemeMap(projectId);

  // Delete disk cache
  try {
    const diskCachePath = join(homedir(), '.synapse-themes', projectId, '.theme-map.json');
    await unlink(diskCachePath);
  } catch {
    // No disk cache to delete — fine
  }
}
