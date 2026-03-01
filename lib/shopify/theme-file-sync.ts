import { createClient } from '@/lib/supabase/server';

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Mark a file for Shopify theme push by upserting into theme_files.
 * No-op if: filePath is null, project has no Shopify connection, or connection has no theme.
 */
export async function markFileForPush(
  projectId: string,
  filePath: string | null,
  syncStatus: 'pending' | 'deleted' = 'pending',
): Promise<void> {
  if (!filePath) return;

  const normalized = normalizePath(filePath);
  if (!normalized) return;

  try {
    const supabase = await createClient();

    const { data: project } = await supabase
      .from('projects')
      .select('shopify_connection_id')
      .eq('id', projectId)
      .maybeSingle();

    if (!project?.shopify_connection_id) return;

    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id, theme_id')
      .eq('id', project.shopify_connection_id)
      .maybeSingle();

    if (!connection?.theme_id) return;

    const now = new Date().toISOString();
    await supabase
      .from('theme_files')
      .upsert(
        {
          connection_id: connection.id,
          file_path: normalized,
          sync_status: syncStatus,
          project_id: projectId,
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'connection_id,file_path' },
      );
  } catch (err) {
    console.warn('[theme-file-sync] markFileForPush failed:', err instanceof Error ? err.message : err);
  }
}
