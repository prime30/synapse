import { createClient as createAnonClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  shouldUseStorage,
  uploadToStorage,
  downloadFromStorage,
  deleteFromStorage,
} from '@/lib/storage/files';
import type { CreateFileInput, UpdateFileInput, FileFilter } from '@/lib/types/files';
import { APIError } from '@/lib/errors/handler';
import { invalidateProjectFilesCache, invalidateFileContent } from '@/lib/supabase/file-loader';

/**
 * Returns a Supabase client that bypasses RLS (service role).
 * Falls back to the anon cookie-based client if the key isn't set.
 */
async function getClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  return createAnonClient();
}

export async function createFile(input: CreateFileInput) {
  const supabase = await getClient();

  // Check for duplicate filename per project (REQ-4)
  const { data: existing } = await supabase
    .from('files')
    .select('id')
    .eq('project_id', input.project_id)
    .eq('name', input.name)
    .maybeSingle();

  if (existing) {
    throw APIError.conflict(`A file named '${input.name}' already exists`);
  }
  const sizeBytes = new TextEncoder().encode(input.content).length;
  const useStorage = shouldUseStorage(sizeBytes);

  let storagePath: string | null = null;
  let dbContent: string | null = input.content;

  if (useStorage) {
    storagePath = await uploadToStorage(input.project_id, input.path, input.content);
    dbContent = null;
  }

  const { data, error } = await supabase
    .from('files')
    .insert({
      project_id: input.project_id,
      name: input.name,
      path: input.path,
      file_type: input.file_type,
      size_bytes: sizeBytes,
      content: dbContent,
      storage_path: storagePath,
      created_by: input.created_by,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Invalidate project files cache after creating a file
  await invalidateProjectFilesCache(input.project_id).catch(() => {});

  return data;
}

export async function getFile(fileId: string) {
  const supabase = await getClient();

  const { data: file, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) throw error;

  // Fetch from storage if content is stored there
  if (file.storage_path && !file.content) {
    file.content = await downloadFromStorage(file.storage_path);
  }

  return file;
}

export async function updateFile(fileId: string, input: UpdateFileInput) {
  const supabase = await getClient();

  const updates: Record<string, unknown> = {};

  if (input.name) {
    const { data: currentFile } = await supabase
      .from('files')
      .select('project_id')
      .eq('id', fileId)
      .single();
    if (currentFile) {
      const { data: existing } = await supabase
        .from('files')
        .select('id')
        .eq('project_id', currentFile.project_id)
        .eq('name', input.name)
        .neq('id', fileId)
        .maybeSingle();
      if (existing) {
        throw APIError.conflict(`A file named '${input.name}' already exists`);
      }
    }
    updates.name = input.name;
    updates.path = input.path ?? input.name;
  }
  if (input.path && !input.name) updates.path = input.path;

  if (input.content !== undefined) {
    const sizeBytes = new TextEncoder().encode(input.content).length;
    const useStorage = shouldUseStorage(sizeBytes);

    // Get current file to check storage strategy
    const { data: currentFile } = await supabase
      .from('files')
      .select('storage_path, project_id, path')
      .eq('id', fileId)
      .single();

    if (currentFile?.storage_path) {
      await deleteFromStorage(currentFile.storage_path);
    }

    if (useStorage) {
      const projectId = currentFile?.project_id ?? '';
      const filePath = input.path ?? currentFile?.path ?? '';
      updates.storage_path = await uploadToStorage(projectId, filePath, input.content);
      updates.content = null;
    } else {
      updates.content = input.content;
      updates.storage_path = null;
    }

    updates.size_bytes = sizeBytes;
  }

  const { data, error } = await supabase
    .from('files')
    .update(updates)
    .eq('id', fileId)
    .select()
    .single();

  if (error) throw error;

  // Granular invalidation: only bust the per-file content cache for this file.
  // Metadata (file list) hasn't changed, so no need to invalidate the project cache.
  invalidateFileContent(fileId);

  return data;
}

export async function deleteFile(fileId: string) {
  const supabase = await getClient();

  const { data: file } = await supabase
    .from('files')
    .select('storage_path, project_id')
    .eq('id', fileId)
    .single();

  if (file?.storage_path) {
    await deleteFromStorage(file.storage_path);
  }

  const { error } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId);

  if (error) throw error;

  // Invalidate project files cache after deleting a file
  if (file?.project_id) {
    await invalidateProjectFilesCache(file.project_id).catch(() => {});
  }
}

export async function listProjectFiles(
  projectId: string,
  filter?: FileFilter
) {
  const supabase = await getClient();

  let query = supabase
    .from('files')
    .select('id, name, path, file_type, size_bytes, created_at, updated_at')
    .eq('project_id', projectId)
    .order('path', { ascending: true });

  if (filter?.file_type) {
    query = query.eq('file_type', filter.file_type);
  }

  if (filter?.search) {
    query = query.ilike('name', `%${filter.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * List project files WITH content. Used for bulk sync-to-disk.
 * - Inline content for files < 100KB (stored in `content` column)
 * - Parallel-fetch from Supabase Storage for files >= 100KB
 * - Skips binary file types (image, font, binary)
 */
export async function listProjectFilesWithContent(
  projectId: string,
  filter?: FileFilter,
): Promise<Array<{ id: string; path: string; file_type: string; content: string }>> {
  const supabase = await getClient();

  let query = supabase
    .from('files')
    .select('id, name, path, file_type, content, storage_path, size_bytes')
    .eq('project_id', projectId)
    .order('path', { ascending: true });

  if (filter?.file_type) {
    query = query.eq('file_type', filter.file_type);
  }
  if (filter?.search) {
    query = query.ilike('name', `%${filter.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];

  // Filter out binary files
  const BINARY_TYPES = ['image', 'font', 'binary'];
  const textFiles = data.filter((f) => !BINARY_TYPES.includes(f.file_type));

  // Separate files needing storage download
  const inlineFiles = textFiles.filter((f) => f.content != null);
  const storageFiles = textFiles.filter((f) => f.content == null && f.storage_path);

  // Parallel-fetch from storage with concurrency limit
  const CONCURRENCY = 10;
  const storageResults: Array<{ id: string; path: string; file_type: string; content: string }> = [];

  for (let i = 0; i < storageFiles.length; i += CONCURRENCY) {
    const batch = storageFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (f) => {
        const content = await downloadFromStorage(f.storage_path!);
        return { id: f.id, path: f.path, file_type: f.file_type, content };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        storageResults.push(r.value);
      }
    }
  }

  return [
    ...inlineFiles.map((f) => ({
      id: f.id,
      path: f.path,
      file_type: f.file_type,
      content: f.content as string,
    })),
    ...storageResults,
  ];
}
