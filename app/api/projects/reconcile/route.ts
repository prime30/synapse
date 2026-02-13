import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

/**
 * POST /api/projects/reconcile
 * Cross-reference user projects against Shopify themes.
 * Archives projects whose dev theme no longer exists on Shopify.
 * Auto-restores archived projects whose dev theme was re-created externally.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId);

    if (!connection) {
      return successResponse({ archived: 0, restored: 0, archivedProjectIds: [], archivedProjectNames: [] });
    }

    // List all themes from Shopify — fail-safe: never archive on API errors
    let shopifyThemeIds: Set<string>;
    try {
      const api = await ShopifyAdminAPIFactory.create(connection.id);
      const themes = await api.listThemes();
      shopifyThemeIds = new Set(themes.map((t) => String(t.id)));
    } catch {
      // Shopify API failure — return zeros, never archive on errors
      return successResponse({ archived: 0, restored: 0, archivedProjectIds: [], archivedProjectNames: [] });
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch all user projects linked to this connection
    const { data: orgMembers } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    if (!orgMembers?.length) {
      return successResponse({ archived: 0, restored: 0, archivedProjectIds: [], archivedProjectNames: [] });
    }

    const orgIds = [...new Set(orgMembers.map((m) => m.organization_id))];

    // Try to select with status and dev_theme_id; fall back gracefully
    let projects: Array<{ id: string; name: string; dev_theme_id: string | null; shopify_connection_id: string | null; status: string }> = [];
    {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, dev_theme_id, shopify_connection_id, status')
        .in('organization_id', orgIds)
        .eq('shopify_connection_id', connection.id);

      if (error) {
        // Column might not exist yet — try without status
        const { data: fallback } = await supabase
          .from('projects')
          .select('id, name, dev_theme_id, shopify_connection_id')
          .in('organization_id', orgIds)
          .eq('shopify_connection_id', connection.id);
        projects = (fallback ?? []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          dev_theme_id: (p.dev_theme_id as string | null) ?? null,
          shopify_connection_id: (p.shopify_connection_id as string | null) ?? null,
          status: 'active',
        }));
      } else {
        projects = (data ?? []) as typeof projects;
      }
    }

    const toArchive: { id: string; name: string }[] = [];
    const toRestore: string[] = [];

    for (const project of projects) {
      // Skip projects without dev_theme_id (pre-migration or no import)
      if (!project.dev_theme_id) continue;
      // Skip projects without a connection (manual projects)
      if (!project.shopify_connection_id) continue;

      const themeExists = shopifyThemeIds.has(project.dev_theme_id);

      if (!themeExists && project.status === 'active') {
        toArchive.push({ id: project.id, name: project.name });
      } else if (themeExists && project.status === 'archived') {
        toRestore.push(project.id);
      }
    }

    // Batch archive
    if (toArchive.length > 0) {
      const archiveIds = toArchive.map((p) => p.id);
      await supabase
        .from('projects')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .in('id', archiveIds);
    }

    // Batch restore
    if (toRestore.length > 0) {
      await supabase
        .from('projects')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .in('id', toRestore);
    }

    return successResponse({
      archived: toArchive.length,
      restored: toRestore.length,
      archivedProjectIds: toArchive.map((p) => p.id),
      archivedProjectNames: toArchive.map((p) => p.name),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
