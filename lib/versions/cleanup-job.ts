import { createClient } from '@/lib/supabase/server';

export async function cleanupOldVersions(daysToKeep = 90) {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('file_versions')
    .delete()
    .lt('created_at', cutoff);

  if (error) {
    throw new Error(`Failed to cleanup versions: ${error.message}`);
  }
}
