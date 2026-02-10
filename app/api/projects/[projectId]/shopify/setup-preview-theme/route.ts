import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

/** Admin client that bypasses RLS. Falls back to cookie-based client. */
async function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  return createClient();
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/setup-preview-theme
 * After import: ensure dev theme exists, mark theme_files pending, push to dev theme, record push history.
 * Body: { note?: string }. Never pushes to main theme.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const note =
      typeof body.note === 'string' ? body.note : 'Preview after import';

    const supabase = await adminSupabase();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id, theme_id')
      .eq('project_id', projectId)
      .maybeSingle();

    // #region agent log H4
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H4',location:'app/api/projects/[projectId]/shopify/setup-preview-theme/route.ts:53',message:'setup-preview connection lookup',data:{projectId,hasConnection:!!connection,connectionId:connection?.id??null,hasThemeId:!!connection?.theme_id,hasServiceRoleKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    let themeId: string;
    try {
      themeId = await ensureDevTheme(connection.id);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown error';
      // #region agent log H4
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H4',location:'app/api/projects/[projectId]/shopify/setup-preview-theme/route.ts:69',message:'setup-preview ensureDevTheme failed',data:{projectId,connectionId:connection.id,errorMessage:msg},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new APIError(
        msg.includes('SHOPIFY_DEV_THEME') || msg.includes('zip')
          ? msg
          : `Preview theme could not be created: ${msg}`,
        'SETUP_ERROR',
        500
      );
    }

    const api = await ShopifyAdminAPIFactory.create(connection.id);
    const theme = await api.getTheme(Number(themeId)).catch(() => null);
    if (!theme) {
      throw APIError.notFound(
        'Preview theme no longer exists. Reconnect or set up preview again.'
      );
    }
    if (theme.role === 'main') {
      throw APIError.forbidden(
        'Cannot update the live theme. Only the preview theme can be changed.'
      );
    }

    await supabase
      .from('theme_files')
      .update({ sync_status: 'pending' })
      .eq('connection_id', connection.id);

    const snapshot = await buildSnapshotForConnection(
      supabase,
      connection.id,
      projectId
    );

    const syncService = new ThemeSyncService();
    const result = await syncService.pushTheme(
      connection.id,
      Number(themeId)
    );
    // #region agent log H7
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run2',hypothesisId:'H7',location:'app/api/projects/[projectId]/shopify/setup-preview-theme/route.ts:104',message:'setup-preview pushTheme result',data:{projectId,connectionId:connection.id,themeId,pushed:result.pushed,errorsCount:result.errors.length,snapshotFiles:snapshot.files.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    try {
      await recordPush(connection.id, themeId, snapshot, {
        note,
        trigger: 'import',
      });
      // #region agent log H7
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run2',hypothesisId:'H7',location:'app/api/projects/[projectId]/shopify/setup-preview-theme/route.ts:114',message:'setup-preview recordPush succeeded',data:{projectId,connectionId:connection.id,themeId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      // #region agent log H7
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run2',hypothesisId:'H7',location:'app/api/projects/[projectId]/shopify/setup-preview-theme/route.ts:120',message:'setup-preview recordPush failed',data:{projectId,connectionId:connection.id,themeId,errorMessage:msg},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw err;
    }

    return successResponse({
      theme_id: themeId,
      pushed: result.pushed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
