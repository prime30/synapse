import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createClient as createServiceClient } from '@supabase/supabase-js';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/files/count
 * Returns the current file count for a project (lightweight, designed for polling).
 *
 * Intentionally uses a relaxed auth check (requireAuth only, not requireProjectAccess)
 * because this endpoint is polled during import before the project row is created.
 * The client generates a UUID and starts polling immediately; the import route
 * creates the project with that UUID shortly after. If the project doesn't exist
 * yet, we return count: 0 instead of 404.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    // Auth: verify the user is logged in (project may not exist yet during import)
    await requireAuth(request);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { count, error } = await supabase
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (error) {
      // Project may not exist yet — return 0 instead of erroring
      return successResponse({ count: 0 });
    }

    return successResponse({ count: count ?? 0 });
  } catch (error) {
    return handleAPIError(error);
  }
}
