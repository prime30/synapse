import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getClient } from '@/lib/design-tokens/components/component-persistence';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  GET  — List design components for a project                        */
/* ------------------------------------------------------------------ */

/**
 * GET /api/projects/[projectId]/design-tokens/components
 *
 * Returns all detected design components for the project from the
 * `design_components` table. The `files` array comes from
 * `preview_data.files` (JSONB), not a top-level column.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await getClient();
    const { data: rows, error } = await supabase
      .from('design_components')
      .select('*')
      .eq('project_id', projectId)
      .order('name');

    if (error) throw error;

    const components = (rows ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      file_path: row.file_path as string,
      component_type: row.component_type as string,
      files: ((row.preview_data as Record<string, unknown>)?.files as string[]) ?? [],
      tokens_used: (row.tokens_used as string[]) ?? [],
      usage_frequency: (row.usage_frequency as number) ?? 0,
    }));

    return successResponse({ components });
  } catch (error) {
    return handleAPIError(error);
  }
}
