import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { VersionService } from '@/lib/versions/version-service';

interface RouteParams {
  params: Promise<{ file_path: string }>;
}

const versionService = new VersionService();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { file_path } = await params;
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

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const versions = await versionService.getVersionChain(file.id, limit, offset);
    return successResponse(versions);
  } catch (error) {
    return handleAPIError(error);
  }
}
