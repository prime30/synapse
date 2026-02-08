import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { VersionService } from '@/lib/versions/version-service';
import { updateFile } from '@/lib/services/files';

interface RouteParams {
  params: Promise<{ file_path: string; version_id: string }>;
}

const versionService = new VersionService();

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { file_path, version_id } = await params;
    const decodedPath = decodeURIComponent(file_path);

    const supabase = await createClient();
    const { data: file, error } = await supabase
      .from('files')
      .select('id')
      .eq('path', decodedPath)
      .maybeSingle();

    if (error || !file) {
      throw APIError.notFound('File not found');
    }

    const version = await versionService.getVersion(version_id);
    if (!version) {
      throw APIError.notFound('Version not found');
    }

    await updateFile(file.id, { content: version.content });
    const newVersion = await versionService.createVersion(
      file.id,
      version.content,
      userId,
      `Restored to version ${version.version_number}`
    );

    return successResponse(newVersion, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
