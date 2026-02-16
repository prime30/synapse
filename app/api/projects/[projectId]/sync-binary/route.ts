import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ThemeSyncService } from '@/lib/shopify/sync-service';

export const maxDuration = 60; // Allow up to 60s for binary downloads

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/sync-binary
 * Returns the count of binary_pending files for this project.
 * Used by the client to decide whether to trigger a sync.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find the connection for this project
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle();

    if (!connection) {
      return successResponse({ pending: 0 });
    }

    const { count, error } = await supabase
      .from('theme_files')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connection.id)
      .eq('sync_status', 'binary_pending');

    if (error) throw error;

    return successResponse({ pending: count ?? 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('theme_files')) {
      return successResponse({ pending: 0 });
    }
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/sync-binary
 * Downloads deferred binary assets from Shopify CDN, uploads to storage,
 * and inserts into the files table. Client-initiated to avoid serverless
 * fire-and-forget issues.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find the connection and theme ID for this project
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id, shopify_theme_id')
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle();

    if (!connection) {
      // No connection — nothing to sync, but also look up via project metadata
      const { data: project } = await supabase
        .from('projects')
        .select('shopify_connection_id, shopify_theme_id')
        .eq('id', projectId)
        .single();

      if (!project?.shopify_connection_id || !project?.shopify_theme_id) {
        return successResponse({ synced: 0, total: 0, errors: [] });
      }

      const syncService = new ThemeSyncService();
      const result = await syncService.pullBinaryAssets(
        project.shopify_connection_id,
        Number(project.shopify_theme_id),
        projectId
      );

      return successResponse(result);
    }

    if (!connection.shopify_theme_id) {
      throw APIError.badRequest('No theme ID associated with this connection');
    }

    const syncService = new ThemeSyncService();
    const result = await syncService.pullBinaryAssets(
      connection.id,
      Number(connection.shopify_theme_id),
      projectId
    );

    return successResponse(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('ThemeSyncService')) {
      return successResponse({ synced: 0, total: 0, errors: [] });
    }
    return handleAPIError(error);
  }
}
