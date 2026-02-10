import { createClient } from '@/lib/supabase/server';
import { ThemeSyncService } from './sync-service';
import { buildSnapshotForConnection, recordPush } from './push-history';

const DEBOUNCE_MS = 800;

const timers = new Map<string, NodeJS.Timeout>();

/**
 * Schedule a push to the Shopify dev theme for this project after the next save.
 * Debounces by projectId so rapid saves coalesce into one push.
 * On flush: runs pushTheme for pending theme_files. Client refresh is triggered via
 * save response shopifyPushQueued + delayed PREVIEW_SYNC_EVENT on the client.
 */
export function schedulePushForProject(projectId: string): void {
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    timers.delete(projectId);
    runPushForProject(projectId).catch(() => {
      // Log but don't throw; save already succeeded
    });
  }, DEBOUNCE_MS);

  timers.set(projectId, timer);
}

async function runPushForProject(projectId: string): Promise<void> {
  const supabase = await createClient();

  const { data: connection, error: connError } = await supabase
    .from('shopify_connections')
    .select('id, theme_id')
    .eq('project_id', projectId)
    .maybeSingle();

  if (connError || !connection?.theme_id) {
    if (connError) {
      console.warn('[Shopify push-queue] Connection lookup failed:', projectId, connError.message);
    }
    return;
  }

  const themeId = Number(connection.theme_id);
  if (!Number.isFinite(themeId)) return;

  const snapshot = await buildSnapshotForConnection(
    supabase,
    connection.id,
    projectId
  );

  try {
    const syncService = new ThemeSyncService();
    const result = await syncService.pushTheme(connection.id, themeId);
    if (result.errors.length > 0) {
      console.warn('[Shopify push-queue] Push had errors:', projectId, result.errors);
    }
    if (result.pushed > 0 && snapshot.files.length > 0) {
      await recordPush(connection.id, connection.theme_id, snapshot, {
        note: 'Auto-push after save',
        trigger: 'auto_save',
      });
    }
  } catch (err) {
    console.warn('[Shopify push-queue] Push failed:', projectId, err instanceof Error ? err.message : err);
  }
}
