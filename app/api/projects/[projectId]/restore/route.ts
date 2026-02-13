import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';

export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/restore
 * Restore an archived project by creating a new dev theme on Shopify.
 * Returns immediately — the file push is deferred to /sync-dev-theme.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Read project details
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id, name, shopify_connection_id, shopify_theme_id, status')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      throw APIError.notFound('Project not found');
    }

    if (!project.shopify_connection_id) {
      throw APIError.badRequest('Project has no Shopify connection');
    }

    // Create a new empty dev theme on Shopify (instant — ~1s)
    const sourceThemeId = project.shopify_theme_id
      ? Number(project.shopify_theme_id)
      : undefined;

    const newDevThemeId = await ensureDevTheme(project.shopify_connection_id, {
      themeName: `${project.name} - Synapse`,
      sourceThemeId: sourceThemeId || undefined,
    });

    // Update project: set active, store new dev theme ID
    const updateFields: Record<string, unknown> = {
      status: 'active',
      dev_theme_id: newDevThemeId,
      updated_at: new Date().toISOString(),
    };
    await supabase
      .from('projects')
      .update(updateFields)
      .eq('id', projectId);

    // Mark theme files as pending for push (so /sync-dev-theme picks them up)
    await supabase
      .from('theme_files')
      .update({ sync_status: 'pending' })
      .eq('connection_id', project.shopify_connection_id)
      .neq('sync_status', 'binary_pending');

    return successResponse({
      projectId,
      devThemeId: newDevThemeId,
      status: 'active',
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
