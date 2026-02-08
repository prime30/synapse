import { createClient } from '@/lib/supabase/server';
import {
  shouldUseStorage,
  uploadToStorage,
  downloadFromStorage,
  deleteFromStorage,
} from '@/lib/storage/files';
import type { CreateFileInput, UpdateFileInput, FileFilter } from '@/lib/types/files';
import { APIError } from '@/lib/errors/handler';

export async function createFile(input: CreateFileInput) {
  const supabase = await createClient();

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

  if (error) throw error;
  return data;
}

export async function getFile(fileId: string) {
  const supabase = await createClient();

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
  const supabase = await createClient();

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
  return data;
}

export async function deleteFile(fileId: string) {
  const supabase = await createClient();

  const { data: file } = await supabase
    .from('files')
    .select('storage_path')
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
}

export async function listProjectFiles(
  projectId: string,
  filter?: FileFilter
) {
  const supabase = await createClient();

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
