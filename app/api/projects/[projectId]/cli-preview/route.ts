import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { cliPreviewManager } from '@/lib/preview/cli-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/cli-preview
 *
 * Starts the Shopify CLI dev server for live preview of the draft theme.
 * Writes theme files from Supabase to a temp directory, then starts
 * `shopify theme dev` pointing at that directory.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection?.store_domain) {
      return NextResponse.json({ error: 'No Shopify connection found' }, { status: 404 });
    }

    if (!connection.theme_access_password_encrypted) {
      return NextResponse.json({ error: 'Theme Access password not configured' }, { status: 400 });
    }

    const tkaPassword = await tokenManager.getThemeAccessPassword(connection.id);
    if (!tkaPassword) {
      return NextResponse.json({ error: 'Failed to decrypt Theme Access password' }, { status: 500 });
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Use the connection's theme_id — this is the theme files were imported from.
    // dev_theme_id may point to a different theme and cause mismatches.
    const themeId = connection.theme_id;
    console.log(`[CLI Preview] TKA prefix: ${tkaPassword.slice(0, 12)}... theme=${themeId}, store=${connection.store_domain}`);

    if (!themeId) {
      return NextResponse.json({ error: 'No theme ID configured' }, { status: 400 });
    }

    // Fetch theme files from Supabase (already imported)
    const { data: files, error: filesErr } = await supabase
      .from('files')
      .select('path, content')
      .eq('project_id', projectId)
      .not('content', 'is', null);

    if (filesErr) {
      return NextResponse.json({ error: 'Failed to load theme files' }, { status: 500 });
    }

    const themeFiles = (files ?? [])
      .filter((f: { path: string | null; content: string | null }) =>
        f.path && typeof f.content === 'string' && f.content.length > 0
      )
      .map((f: { path: string; content: string }) => ({
        path: f.path,
        content: f.content,
      }));

    const result = await cliPreviewManager.start({
      projectId,
      storeDomain: connection.store_domain,
      tkaPassword,
      themeId: String(themeId),
      files: themeFiles,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/projects/[projectId]/cli-preview
 *
 * Returns the status of the CLI dev server for this project.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const status = cliPreviewManager.getStatus(projectId);
    if (!status) {
      return NextResponse.json({ running: false, status: 'stopped' });
    }

    return NextResponse.json(status);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/cli-preview
 *
 * Stops the CLI dev server for this project.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    await cliPreviewManager.stop(projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
