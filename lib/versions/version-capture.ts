import { createClient } from '@/lib/supabase/server';
import { VersionService } from './version-service';

const versionService = new VersionService();

export async function captureVersionOnSave(
  fileId: string,
  content: string,
  userId: string
) {
  const latest = await versionService.getLatestVersion(fileId);
  if (latest?.content === content) {
    return null;
  }

  const created = await versionService.createVersion(fileId, content, userId);
  await enforceVersionLimit(fileId, 100);
  return created;
}

async function enforceVersionLimit(fileId: string, maxVersions: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('file_versions')
    .select('id')
    .eq('file_id', fileId)
    .order('version_number', { ascending: false });

  if (error || !data) return;
  if (data.length <= maxVersions) return;

  const toDelete = data.slice(maxVersions).map((row) => row.id);
  if (toDelete.length > 0) {
    await supabase.from('file_versions').delete().in('id', toDelete);
  }
}
