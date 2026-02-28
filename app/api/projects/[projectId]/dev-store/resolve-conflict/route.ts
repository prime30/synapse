import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

function adminSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/projects/[projectId]/dev-store/resolve-conflict
 *
 * Resolves a single file conflict detected by the sync-check endpoint.
 * - resolution 'local': keep local version (will be pushed on next push)
 * - resolution 'remote': overwrite local file with the provided remote content
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const { filePath, resolution, remoteContent } = body as {
      filePath?: string;
      resolution?: string;
      remoteContent?: string;
    };

    if (!filePath || typeof filePath !== 'string') {
      throw APIError.badRequest('filePath is required');
    }

    if (resolution !== 'local' && resolution !== 'remote') {
      throw APIError.badRequest('resolution must be "local" or "remote"');
    }

    if (resolution === 'remote') {
      if (typeof remoteContent !== 'string') {
        throw APIError.badRequest('remoteContent is required when resolution is "remote"');
      }

      const supabase = adminSupabase();
      const { error } = await supabase
        .from('files')
        .update({ content: remoteContent, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('path', filePath);

      if (error) {
        throw APIError.internal(`Failed to update file: ${error.message}`);
      }
    }

    return NextResponse.json({ ok: true, filePath, resolution });
  } catch (error) {
    return handleAPIError(error);
  }
}
