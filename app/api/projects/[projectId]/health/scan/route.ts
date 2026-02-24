import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listProjectFilesWithContent } from '@/lib/services/files';
import { scanThemeHealth } from '@/lib/ai/theme-health-scanner';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/health/scan
 *
 * Runs theme health scan (a11y, performance, CX gaps) and stores result.
 * Returns HealthScanResult.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const files = await listProjectFilesWithContent(projectId);
    const fileContents = new Map<string, string>();
    for (const f of files) {
      if (f.content) fileContents.set(f.path, f.content);
    }

    const result = await scanThemeHealth(fileContents);

    const supabase = await createClient();
    await supabase.from('theme_health_scans').insert({
      project_id: projectId,
      scan_type: 'full',
      findings: result.findings,
      severity: result.overallSeverity,
      file_count: result.fileCount,
      scan_duration_ms: result.scanDurationMs,
    });

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
