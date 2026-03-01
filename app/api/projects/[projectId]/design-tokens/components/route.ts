import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getClient } from '@/lib/design-tokens/components/component-persistence';
import { listByProject } from '@/lib/design-tokens/models/token-model';

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

    // Resolve token IDs to names
    const allTokens = await listByProject(projectId);
    const tokenNameMap = new Map(allTokens.map((t) => [t.id, t.name]));

    const components = (rows ?? []).map((row: Record<string, unknown>) => {
      const rawTokenIds = (row.tokens_used as string[]) ?? [];
      // Filter out stale references (deleted tokens)
      const validTokenIds = rawTokenIds.filter((id) => tokenNameMap.has(id));
      const tokenNames = validTokenIds.map((id) => tokenNameMap.get(id)!);
      const previewData = (row.preview_data as Record<string, unknown>) ?? {};

      return {
        id: row.id as string,
        name: row.name as string,
        file_path: row.file_path as string,
        component_type: row.component_type as string,
        files: (previewData.files as string[]) ?? [],
        tokens_used: validTokenIds,
        token_names: tokenNames,
        usage_frequency: (row.usage_frequency as number) ?? 0,
        variants: (row.variants as string[]) ?? [],
        buttonTokenSet: previewData.buttonTokenSet as Record<string, Record<string, string>> | undefined,
      };
    });

    return successResponse({ components });
  } catch (error) {
    return handleAPIError(error);
  }
}
