import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY required for Shopify operations');
}

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/**
 * POST /api/stores/[connectionId]/import
 * Import a Shopify theme: auto-creates a project, pulls files, optionally sets up preview.
 * Body: { themeId: number, themeName?: string, createDevThemeForPreview?: boolean, note?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

    // Verify connection belongs to user
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getConnectionById(connectionId);
    if (!connection || connection.user_id !== userId) {
      throw APIError.notFound('Store connection not found');
    }

    const body = await request.json().catch(() => ({}));
    const themeId = typeof body.themeId === 'number' ? body.themeId : null;
    const themeName = typeof body.themeName === 'string' ? body.themeName.trim() : null;
    const createDevThemeForPreview = body.createDevThemeForPreview !== false;
    const note = typeof body.note === 'string' ? body.note.trim() : 'Import from store';

    if (!themeId || !Number.isFinite(themeId)) {
      throw APIError.badRequest('themeId (number) is required');
    }

    const supabase = getAdminClient();

    // Resolve the theme name from Shopify if not provided
    let resolvedThemeName = themeName;
    if (!resolvedThemeName) {
      try {
        const api = await ShopifyAdminAPIFactory.create(connectionId);
        const theme = await api.getTheme(themeId);
        resolvedThemeName = theme.name;
      } catch {
        resolvedThemeName = `Theme ${themeId}`;
      }
    }

    // 1. Get user's org to create the project in
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (!membership) {
      throw APIError.badRequest('User has no organization. Create one first.');
    }

    // 2. Auto-create a project named after the theme
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: resolvedThemeName,
        description: `Imported from ${connection.store_domain}`,
        organization_id: membership.organization_id,
        owner_id: userId,
        shopify_connection_id: connectionId,
        shopify_theme_id: String(themeId),
        shopify_theme_name: resolvedThemeName,
        shopify_store_url: `https://${connection.store_domain}`,
      })
      .select('id, name')
      .single();

    if (projectError || !project) {
      throw new APIError(
        `Failed to create project: ${projectError?.message ?? 'Unknown error'}`,
        'PROJECT_CREATE_FAILED',
        500
      );
    }

    // 3. Pull theme files into the new project
    const syncService = new ThemeSyncService();
    const result = await syncService.pullTheme(connectionId, themeId, project.id);

    // 4. Optionally set up preview theme
    let previewThemeId: string | null = null;
    let pushResult = null;
    if (createDevThemeForPreview) {
      try {
        previewThemeId = await ensureDevTheme(connectionId, {
          themeName: note || undefined,
        });

        // Mark theme files as pending for push
        await supabase
          .from('theme_files')
          .update({ sync_status: 'pending' })
          .eq('connection_id', connectionId);

        const snapshot = await buildSnapshotForConnection(
          supabase,
          connectionId,
          project.id
        );

        pushResult = await syncService.pushTheme(connectionId, Number(previewThemeId), undefined, project.id);

        if (pushResult.pushed > 0 && snapshot.files.length) {
          await recordPush(connectionId, previewThemeId, snapshot, {
            note,
            trigger: 'import',
          });
        }
      } catch {
        // Preview setup is optional; import still succeeded
      }
    }

    // 5. Update last_sync_at
    await supabase
      .from('shopify_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: result.errors.length > 0 ? 'error' : 'connected',
      })
      .eq('id', connectionId);

    return successResponse({
      projectId: project.id,
      projectName: project.name,
      pulled: result.pulled,
      pushed: pushResult?.pushed ?? 0,
      errors: result.errors,
      conflicts: result.conflicts,
      previewThemeId,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
