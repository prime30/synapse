import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { createClient as createServiceClient } from '@supabase/supabase-js';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/export
 * Export all project files as a downloadable JSON bundle.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for export');
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    let projectName = 'Unknown';
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();

      if (project?.name) {
        projectName = project.name;
      }
    } catch {
      // Use default projectName if project query fails
    }

    let files: { path: string; content: string | null; type: string | null }[] = [];
    try {
      const { data: filesData, error } = await supabase
        .from('files')
        .select('path, content, file_type')
        .eq('project_id', projectId)
        .order('path');

      if (!error && filesData) {
        files = filesData.map((f) => ({
          path: f.path,
          content: f.content,
          type: f.file_type,
        }));
      }
    } catch {
      // Use empty files array if query fails
    }

    const exportData = {
      name: projectName,
      exportedAt: new Date().toISOString(),
      fileCount: files.length,
      files,
    };

    const slugName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export';

    const json = JSON.stringify(exportData, null, 2);
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${slugName}-export.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
