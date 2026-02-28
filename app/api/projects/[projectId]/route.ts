import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * PATCH /api/projects/[projectId]
 * Update project properties (currently: name).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const name =
      typeof body.name === 'string' ? body.name.trim().slice(0, 100) : null;

    if (!name) {
      throw APIError.badRequest(
        'name is required and must be a non-empty string'
      );
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: project, error } = await supabase
      .from('projects')
      .update({ name })
      .eq('id', projectId)
      .select('id, name, updated_at, shopify_connection_id, dev_theme_id')
      .single();

    if (error || !project) {
      throw APIError.internal(error?.message ?? 'Failed to update project');
    }

    // Rename the Shopify dev theme to match (fire-and-forget, non-critical)
    if (project.shopify_connection_id && project.dev_theme_id) {
      const devThemeId = Number(project.dev_theme_id);
      const connectionId = project.shopify_connection_id as string;
      if (Number.isFinite(devThemeId)) {
        (async () => {
          try {
            const { ShopifyAdminAPIFactory } = await import('@/lib/shopify/admin-api-factory');
            const api = await ShopifyAdminAPIFactory.create(connectionId);
            await api.updateTheme(devThemeId, { name: `Synapse Dev - ${name}` });
          } catch {
            // Non-critical — theme rename failure doesn't block the project rename
          }
        })();
      }
    }

    return successResponse({ id: project.id, name: project.name, updated_at: project.updated_at });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]
 * Permanently delete a project and all associated data.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Read project to get connection info
    const { data: project } = await supabase
      .from('projects')
      .select('id, shopify_connection_id, dev_theme_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw APIError.notFound('Project not found');
    }

    // 1. Delete files
    await supabase.from('files').delete().eq('project_id', projectId);

    // 2. Delete theme_files (if connection exists)
    if (project.shopify_connection_id) {
      await supabase
        .from('theme_files')
        .delete()
        .eq('connection_id', project.shopify_connection_id);
    }

    // 3. Remove storage folder (non-blocking)
    try {
      const { data: storageFiles } = await supabase.storage
        .from('project-files')
        .list(projectId);
      if (storageFiles && storageFiles.length > 0) {
        const paths = storageFiles.map((f) => `${projectId}/${f.name}`);
        await supabase.storage.from('project-files').remove(paths);
      }
    } catch {
      // Storage cleanup is non-critical
    }

    // 4. Optionally delete the Shopify dev theme (non-blocking)
    if (project.dev_theme_id && project.shopify_connection_id) {
      try {
        const { ShopifyAdminAPIFactory } = await import(
          '@/lib/shopify/admin-api-factory'
        );
        const api = await ShopifyAdminAPIFactory.create(
          project.shopify_connection_id
        );
        await api.deleteTheme(Number(project.dev_theme_id));
      } catch {
        // Dev theme deletion is non-critical (may already be deleted)
      }
    }

    // 5. Delete the project row
    await supabase.from('projects').delete().eq('id', projectId);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
