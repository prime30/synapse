/**
 * Storage migration service - REQ-4 TASK-2
 * Handles migrating files between database and Supabase Storage when size crosses 100KB threshold.
 */
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'project-files';

export class StorageMigrationService {
  async migrateToStorage(
    fileId: string,
    content: string,
    fileMeta?: { project_id: string; name?: string; path?: string }
  ): Promise<void> {
    const supabase = await createClient();
    const projectId = fileMeta?.project_id ?? '';
    const name = fileMeta?.name ?? fileMeta?.path ?? fileId;
    const storagePath = `${projectId}/${fileId}/${name}`;
    const sizeBytes = new TextEncoder().encode(content).length;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, content, { contentType: 'text/plain', upsert: true });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('files')
      .update({
        content: null,
        storage_path: storagePath,
        size_bytes: sizeBytes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (updateError) throw updateError;
  }

  async migrateToDatabase(fileId: string, content: string): Promise<void> {
    const supabase = await createClient();

    const { data: file } = await supabase
      .from('files')
      .select('storage_path')
      .eq('id', fileId)
      .single();

    if (file?.storage_path) {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    }

    const sizeBytes = new TextEncoder().encode(content).length;

    const { error } = await supabase
      .from('files')
      .update({
        content,
        storage_path: null,
        size_bytes: sizeBytes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (error) throw error;
  }
}
