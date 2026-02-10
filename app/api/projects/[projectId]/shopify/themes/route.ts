import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

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
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/shopify/themes
 * List all themes from the connected Shopify store.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = getAdminClient();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    let themes;
    try {
      const api = await ShopifyAdminAPIFactory.create(connection.id);
      themes = await api.listThemes();
    } catch (err) {
      console.error('[shopify/themes] Failed to list themes:', err);
      throw APIError.internal(
        err instanceof Error ? err.message : 'Failed to load themes from Shopify',
      );
    }

    return successResponse(themes);
  } catch (error) {
    return handleAPIError(error);
  }
}
