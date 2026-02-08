import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/shopify
 * Returns the Shopify connection status for the project.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select(
        'id, store_domain, sync_status, scopes, last_sync_at, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .maybeSingle();

    return successResponse({
      connected: !!connection,
      connection: connection ?? null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/shopify
 * Disconnect the Shopify store from the project.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    const tokenManager = new ShopifyTokenManager();
    await tokenManager.deleteConnection(connection.id);

    return successResponse({ disconnected: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
