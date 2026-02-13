import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

/**
 * POST /api/projects/[projectId]/clone
 * Clone a project's local files into a new project.
 * Body: { name: string, createShopifyTheme?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw APIError.badRequest('name is required');

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw APIError.internal('Service role key not configured');

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    // Get the source project
    const { data: sourceProject, error: projError } = await supabase
      .from('projects')
      .select('organization_id, shopify_connection_id, shopify_theme_id')
      .eq('id', projectId)
      .single();

    if (projError || !sourceProject) {
      throw APIError.notFound('Source project not found');
    }

    // Create the new project in the same organization
    const { data: newProject, error: createError } = await supabase
      .from('projects')
      .insert({
        name,
        organization_id: sourceProject.organization_id,
        owner_id: userId,
        shopify_connection_id: sourceProject.shopify_connection_id,
      })
      .select('id, name')
      .single();

    if (createError || !newProject) {
      throw APIError.internal(createError?.message ?? 'Failed to create project');
    }

    // Copy all files from source to new project
    const { data: sourceFiles, error: filesError } = await supabase
      .from('files')
      .select('path, name, content, file_type, size_bytes')
      .eq('project_id', projectId);

    let filesCopied = 0;
    if (!filesError && sourceFiles && sourceFiles.length > 0) {
      const filesToInsert = sourceFiles.map((f) => ({
        project_id: newProject.id,
        path: f.path,
        name: f.name,
        content: f.content,
        file_type: f.file_type,
        size_bytes: f.size_bytes,
        created_by: userId,
      }));

      // Insert in batches of 100
      for (let i = 0; i < filesToInsert.length; i += 100) {
        const batch = filesToInsert.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from('files')
          .insert(batch);
        if (!insertError) {
          filesCopied += batch.length;
        }
      }
    }

    return successResponse({
      projectId: newProject.id,
      projectName: newProject.name,
      filesCopied,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
