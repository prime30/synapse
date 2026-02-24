import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/chips/click
 *
 * Increments click_count for a CX pattern chip atomically.
 * Body: { patternId: string }
 * Returns: { success: true, click_count: number }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json();
    const patternId = typeof body?.patternId === 'string' ? body.patternId.trim() : null;

    if (!patternId) {
      throw APIError.badRequest('patternId is required');
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('increment_chip_click', {
      p_project_id: projectId,
      p_pattern_id: patternId,
    });

    if (error) {
      throw APIError.internal(error.message);
    }

    const clickCount = Array.isArray(data) && data.length > 0 ? (data[0] as { click_count: number }).click_count : 0;

    return successResponse({ success: true, click_count: clickCount });
  } catch (error) {
    return handleAPIError(error);
  }
}
