import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getFile, createFile } from '@/lib/services/files';
import { APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function generateCopyName(original: string, existingNames: Set<string>): string {
  const ext = original.includes('.') ? original.split('.').pop() : '';
  const base = ext ? original.slice(0, -(ext.length + 1)) : original;
  let candidate = `${base}-copy${ext ? '.' + ext : ''}`;
  let n = 1;
  while (existingNames.has(candidate)) {
    n++;
    candidate = `${base}-copy-${n}${ext ? '.' + ext : ''}`;
  }
  return candidate;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;

    const file = await getFile(id);
    if (!file?.content && !file?.storage_path) {
      throw APIError.notFound('File not found or has no content');
    }

    const content = file.content ?? '';
    if (!content && file.storage_path) {
      const supabase = await createClient();
      const { data: blob } = await supabase.storage
        .from('project-files')
        .download(file.storage_path);
      if (!blob) throw APIError.internal('Failed to read file from storage');
      const text = await blob.text();
      const names = new Set(
        (
          await supabase
            .from('files')
            .select('name')
            .eq('project_id', file.project_id)
        ).data?.map((r) => r.name) ?? []
      );
      const newName = generateCopyName(file.name, names);
      const newFile = await createFile({
        project_id: file.project_id,
        name: newName,
        path: newName,
        file_type: file.file_type,
        content: text,
        created_by: userId,
      });
      return successResponse(newFile, 201);
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('files')
      .select('name')
      .eq('project_id', file.project_id);

    const names = new Set((existing ?? []).map((r) => r.name));
    const newName = generateCopyName(file.name, names);

    const newFile = await createFile({
      project_id: file.project_id,
      name: newName,
      path: newName,
      file_type: file.file_type,
      content,
      created_by: userId,
    });

    return successResponse(newFile, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
