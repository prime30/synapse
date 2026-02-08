/**
 * Hybrid storage service - REQ-4 TASK-2
 * Transparently handles files <100KB in database and ≥100KB in Supabase Storage.
 */
import { createClient } from '@/lib/supabase/server';
import { StorageMigrationService } from './storage-migration';

const BUCKET = 'project-files';
const SIZE_THRESHOLD = 102400; // 100KB

export interface StorageResult {
  storageLocation: 'database' | 'storage';
  sizeBytes: number;
  storagePath?: string;
}

export class HybridStorageService {
  shouldUseStorage(sizeBytes: number): boolean {
    return sizeBytes >= SIZE_THRESHOLD;
  }

  async saveFile(
    projectId: string,
    fileId: string,
    name: string,
    content: string
  ): Promise<StorageResult> {
    const supabase = await createClient();
    const sizeBytes = new TextEncoder().encode(content).length;

    if (this.shouldUseStorage(sizeBytes)) {
      const storagePath = `${projectId}/${fileId}/${name}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, content, {
          contentType: 'text/plain',
          upsert: true,
        });
      if (error) throw error;

      await supabase
        .from('files')
        .update({
          content: null,
          storage_path: storagePath,
          size_bytes: sizeBytes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      return { storageLocation: 'storage', sizeBytes, storagePath };
    } else {
      await supabase
        .from('files')
        .update({
          content,
          storage_path: null,
          size_bytes: sizeBytes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      return { storageLocation: 'database', sizeBytes };
    }
  }

  async getFileContent(fileId: string): Promise<string> {
    const supabase = await createClient();

    const { data: file, error } = await supabase
      .from('files')
      .select('content, storage_path')
      .eq('id', fileId)
      .single();

    if (error) throw error;
    if (!file) throw new Error('File not found');

    if (file.content) {
      return file.content;
    }

    if (file.storage_path) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(file.storage_path);

      if (downloadError) throw downloadError;
      return await blob!.text();
    }

    throw new Error('File has no content or storage path');
  }

  async updateFile(fileId: string, newContent: string): Promise<StorageResult> {
    const supabase = await createClient();

    const { data: currentFile, error: fetchError } = await supabase
      .from('files')
      .select('content, storage_path, project_id, path, name')
      .eq('id', fileId)
      .single();

    if (fetchError || !currentFile) throw fetchError ?? new Error('File not found');

    const sizeBytes = new TextEncoder().encode(newContent).length;
    const currentlyInStorage = !!currentFile.storage_path;
    const shouldBeInStorage = this.shouldUseStorage(sizeBytes);

    if (currentlyInStorage && !shouldBeInStorage) {
      const migration = new StorageMigrationService();
      await migration.migrateToDatabase(fileId, newContent);
      return { storageLocation: 'database', sizeBytes };
    }

    if (!currentlyInStorage && shouldBeInStorage) {
      const migration = new StorageMigrationService();
      await migration.migrateToStorage(fileId, newContent, currentFile);
      return { storageLocation: 'storage', sizeBytes };
    }

    return this.saveFile(
      currentFile.project_id,
      fileId,
      currentFile.name ?? currentFile.path,
      newContent
    );
  }

  async deleteFile(fileId: string): Promise<void> {
    const supabase = await createClient();

    const { data: file } = await supabase
      .from('files')
      .select('storage_path')
      .eq('id', fileId)
      .single();

    if (file?.storage_path) {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    }

    const { error } = await supabase.from('files').delete().eq('id', fileId);
    if (error) throw error;
  }
}

