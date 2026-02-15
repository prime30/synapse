import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/thumbnail
 * Generate and store a thumbnail for this project.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: project } = await supabase
      .from('projects')
      .select('id, shopify_connection_id, dev_theme_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw APIError.notFound('Project not found');
    }

    if (!project.dev_theme_id || !project.shopify_connection_id) {
      throw APIError.badRequest('Project has no Shopify connection or dev theme');
    }

    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('store_domain')
      .eq('id', project.shopify_connection_id)
      .single();

    if (!connection?.store_domain) {
      throw APIError.badRequest('Store connection not found');
    }

    const { generateThumbnail, uploadThumbnail } = await import(
      '@/lib/thumbnail/generator'
    );

    const buffer = await generateThumbnail(
      connection.store_domain,
      String(project.dev_theme_id)
    );

    if (!buffer) {
      throw APIError.internal(
        'Thumbnail generation failed (Chromium may not be available)'
      );
    }

    const storagePath = await uploadThumbnail(projectId, buffer);
    void storagePath; // Used for storage reference

    const thumbnailUrl = `/api/projects/${projectId}/thumbnail`;

    await supabase
      .from('projects')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', projectId);

    return successResponse({ url: thumbnailUrl });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/projects/[projectId]/thumbnail
 * Serve the stored thumbnail image.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const storagePath = `thumbnails/${projectId}.jpg`;
    const { data, error } = await supabase.storage
      .from('project-files')
      .download(storagePath);

    if (error || !data) {
      throw APIError.notFound('Thumbnail not found');
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
