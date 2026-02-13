import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { downloadFromStorage } from '@/lib/storage/files';

interface RouteParams {
  params: Promise<{ projectId: string; themeId: string }>;
}

/**
 * GET /api/projects/[projectId]/shopify/themes/[themeId]/diff
 * Get diff of pending theme files vs Shopify remote.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, themeId } = await params;

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, {
      projectId,
    });

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection for this project');
    }

    const { data: pendingFiles, error: pendingError } = await supabase
      .from('theme_files')
      .select('file_path, content_hash')
      .eq('connection_id', connection.id)
      .eq('sync_status', 'pending');

    if (pendingError) {
      throw APIError.internal(`Failed to query pending files: ${pendingError.message}`);
    }

    if (!pendingFiles || pendingFiles.length === 0) {
      return successResponse({ files: [] });
    }

    const api = await ShopifyAdminAPIFactory.fromProjectId(projectId, userId);

    const diffFiles: {
      path: string;
      local: string | null;
      remote: string | null;
      status: 'modified' | 'added';
    }[] = [];

    for (const { file_path: filePath } of pendingFiles) {
      let localContent: string | null = null;

      const { data: file } = await supabase
        .from('files')
        .select('content, storage_path')
        .eq('project_id', projectId)
        .eq('path', filePath)
        .maybeSingle();

      if (file) {
        localContent = file.content ?? null;
        if (!localContent && file.storage_path) {
          try {
            localContent = await downloadFromStorage(file.storage_path);
          } catch {
            localContent = null;
          }
        }
      }

      let remoteContent: string | null = null;
      try {
        const asset = await api.getAsset(Number(themeId), filePath);
        remoteContent = asset.value ?? null;
      } catch {
        // File might be new/added on remote
      }

      diffFiles.push({
        path: filePath,
        local: localContent,
        remote: remoteContent,
        status: remoteContent ? 'modified' : 'added',
      });
    }

    return successResponse({ files: diffFiles });
  } catch (error) {
    return handleAPIError(error);
  }
}
