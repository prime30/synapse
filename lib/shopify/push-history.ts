import { createClient } from '@/lib/supabase/server';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import { APIError } from '@/lib/errors/handler';
import { downloadFromStorage } from '@/lib/storage/files';
import type { SupabaseClient } from '@supabase/supabase-js';

const SNAPSHOT_MAX_FILES = 500;
const SNAPSHOT_MAX_CONTENT_BYTES = 100 * 1024; // 100KB

/** Allowed trigger values for theme_push_history (must match DB CHECK). */
export const PUSH_TRIGGERS = [
  'manual',
  'import',
  'auto_save',
  'rollback',
] as const;
export type PushTrigger = (typeof PUSH_TRIGGERS)[number];

export interface PushHistorySnapshot {
  files: Array<{ path: string; content: string }>;
}

export interface PushHistoryRow {
  id: string;
  pushed_at: string;
  note: string | null;
  trigger: string;
  file_count: number;
}

/**
 * Build a capped snapshot from theme_files (pending) + file content for this connection.
 * Used when recording push history. Skips files with content > 100KB; max 500 files.
 */
export async function buildSnapshotForConnection(
  supabase: SupabaseClient,
  connectionId: string,
  projectId: string
): Promise<PushHistorySnapshot> {
  const { data: themeFiles } = await supabase
    .from('theme_files')
    .select('file_path')
    .eq('connection_id', connectionId)
    .eq('sync_status', 'pending');

  if (!themeFiles?.length) return { files: [] };

  const files: Array<{ path: string; content: string }> = [];
  for (const tf of themeFiles) {
    if (files.length >= SNAPSHOT_MAX_FILES) break;

    const { data: file } = await supabase
      .from('files')
      .select('id, content, storage_path')
      .eq('project_id', projectId)
      .eq('path', tf.file_path)
      .maybeSingle();

    if (!file) continue;

    let content = file.content;
    if (!content && file.storage_path) {
      try {
        content = await downloadFromStorage(file.storage_path);
      } catch {
        continue;
      }
    }
    if (!content || typeof content !== 'string') continue;

    const sizeBytes = new TextEncoder().encode(content).length;
    if (sizeBytes > SNAPSHOT_MAX_CONTENT_BYTES) continue;

    files.push({ path: tf.file_path, content });
  }

  return { files };
}

/**
 * Snapshot shape: { files: [ { path, content } ] }.
 * Caller may use buildSnapshotForConnection for capped snapshot, or supply their own.
 */
export async function recordPush(
  connectionId: string,
  themeId: string,
  snapshot: PushHistorySnapshot,
  options?: { note?: string | null; trigger?: PushTrigger }
): Promise<string> {
  const supabase = await createClient();
  const trigger = options?.trigger ?? 'manual';
  if (!PUSH_TRIGGERS.includes(trigger)) {
    throw APIError.badRequest(`Invalid trigger: ${trigger}`);
  }

  const { data, error } = await supabase
    .from('theme_push_history')
    .insert({
      connection_id: connectionId,
      theme_id: themeId,
      note: options?.note ?? null,
      trigger,
      snapshot: snapshot as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (error) {
    throw new APIError(
      `Failed to record push: ${error.message}`,
      'INSERT_ERROR',
      500
    );
  }
  return data.id;
}

/**
 * List push history for a project (no snapshot body). Ordered by pushed_at desc.
 */
export async function listPushHistory(
  projectId: string,
  limit = 25
): Promise<PushHistoryRow[]> {
  const supabase = await createClient();

  const { data: connection, error: connError } = await supabase
    .from('shopify_connections')
    .select('id')
    .eq('project_id', projectId)
    .maybeSingle();

  if (connError || !connection) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from('theme_push_history')
    .select('id, pushed_at, note, trigger, snapshot')
    .eq('connection_id', connection.id)
    .order('pushed_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) {
    throw new APIError(
      `Failed to list push history: ${error.message}`,
      'QUERY_ERROR',
      500
    );
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    pushed_at: r.pushed_at,
    note: r.note,
    trigger: r.trigger,
    file_count: Array.isArray(r.snapshot?.files) ? r.snapshot.files.length : 0,
  }));
}

export interface RollbackResult {
  restored: number;
  errors: string[];
}

/**
 * Restore the dev theme to the state in the given push. Verifies connection
 * belongs to project and theme is not main. On per-file failure, continues
 * and collects errors; returns { restored, errors }.
 */
export async function rollbackToPush(
  pushId: string,
  projectId: string
): Promise<RollbackResult> {
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from('theme_push_history')
    .select('connection_id, theme_id, pushed_at, snapshot')
    .eq('id', pushId)
    .single();

  if (rowError || !row) {
    throw APIError.notFound('Push record not found');
  }

  const { data: connection, error: connError } = await supabase
    .from('shopify_connections')
    .select('id')
    .eq('id', row.connection_id)
    .eq('project_id', projectId)
    .single();

  if (connError || !connection) {
    throw APIError.forbidden('Push does not belong to this project');
  }

  const themeIdNum = Number(row.theme_id);
  if (!Number.isFinite(themeIdNum)) {
    throw APIError.badRequest('Invalid theme_id on push record');
  }

  const api = await ShopifyAdminAPIFactory.create(row.connection_id);
  const theme = await api.getTheme(themeIdNum).catch(() => null);
  if (!theme) {
    throw APIError.notFound(
      'Preview theme no longer exists. Reconnect or set up preview again.'
    );
  }
  if (theme.role === 'main') {
    throw APIError.forbidden(
      'Cannot update the live theme. Only the preview theme can be changed.'
    );
  }

  const files = Array.isArray(row.snapshot?.files) ? row.snapshot.files : [];
  const result: RollbackResult = { restored: 0, errors: [] };

  for (const entry of files) {
    if (!entry?.path || typeof entry.content !== 'string') continue;
    try {
      await api.putAsset(themeIdNum, entry.path, entry.content);
      result.restored++;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${entry.path}: ${msg}`);
    }
  }

  const note = `Rollback to push at ${new Date(row.pushed_at ?? Date.now()).toISOString()}`;
  const snapshot = (row.snapshot as PushHistorySnapshot) ?? { files: [] };
  await recordPush(row.connection_id, row.theme_id, snapshot, {
    note,
    trigger: 'rollback',
  }).catch(() => {
    // Best-effort: don't fail rollback if recording fails
  });

  return result;
}
