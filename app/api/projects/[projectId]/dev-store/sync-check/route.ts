import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const TEXT_EXTENSIONS = new Set([
  '.liquid', '.json', '.css', '.js', '.svg', '.html',
]);

function isTextFile(key: string): boolean {
  const dot = key.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(key.slice(dot).toLowerCase());
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function adminSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ConflictEntry {
  path: string;
  localContent: string;
  remoteContent: string;
}

/**
 * POST /api/projects/[projectId]/dev-store/sync-check
 *
 * Detects files edited on the Shopify admin (outside Synapse) since the last
 * push, and auto-pulls non-conflicting changes back into the project.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = adminSupabase();

    // 1. Load project dev-store fields
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('preview_connection_id, preview_store_theme_id, last_dev_store_push_at')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      throw APIError.notFound('Project not found');
    }

    if (!project.preview_connection_id) {
      throw APIError.badRequest('No dev store connection configured for this project');
    }

    const themeId = Number(project.preview_store_theme_id);
    if (!Number.isFinite(themeId) || themeId <= 0) {
      throw APIError.badRequest('No valid dev store theme configured');
    }

    const lastPushAt = project.last_dev_store_push_at
      ? new Date(project.last_dev_store_push_at)
      : null;

    // 2. Create Shopify API and list remote assets (metadata only)
    const api = await ShopifyAdminAPIFactory.create(project.preview_connection_id);
    const remoteAssets = await api.listAssets(themeId);

    // 3. Load local files
    const { data: localFiles, error: filesError } = await supabase
      .from('files')
      .select('path, content, updated_at')
      .eq('project_id', projectId);

    if (filesError) {
      throw APIError.internal(`Failed to query local files: ${filesError.message}`);
    }

    const localMap = new Map<string, { content: string | null; updated_at: string | null }>();
    for (const f of localFiles ?? []) {
      localMap.set(f.path, { content: f.content, updated_at: f.updated_at });
    }

    // 4. Filter to text assets that might have changed since last push
    const candidates = remoteAssets.filter((asset) => {
      if (!isTextFile(asset.key)) return false;
      if (!lastPushAt) return true;
      return new Date(asset.updated_at) > lastPushAt;
    });

    let pulled = 0;
    let unchanged = 0;
    const conflicts: ConflictEntry[] = [];

    // 5. Fetch full content only for candidates and compare
    const CONCURRENCY = 5;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async (asset) => {
        try {
          const detailed = await api.getAsset(themeId, asset.key);
          const remoteContent = detailed.value ?? '';
          const remoteHash = sha256(remoteContent);

          const local = localMap.get(asset.key);
          const localContent = local?.content ?? '';
          const localHash = sha256(localContent);

          if (remoteHash === localHash) {
            unchanged++;
            return;
          }

          // Hashes differ — check for conflict
          const localModifiedSincePush =
            lastPushAt && local?.updated_at
              ? new Date(local.updated_at) > lastPushAt
              : false;

          if (localModifiedSincePush) {
            conflicts.push({
              path: asset.key,
              localContent,
              remoteContent,
            });
          } else {
            // Auto-pull: update local file with remote content
            if (local) {
              await supabase
                .from('files')
                .update({ content: remoteContent, updated_at: new Date().toISOString() })
                .eq('project_id', projectId)
                .eq('path', asset.key);
            } else {
              await supabase
                .from('files')
                .insert({
                  project_id: projectId,
                  path: asset.key,
                  name: asset.key.split('/').pop() ?? asset.key,
                  content: remoteContent,
                  file_type: asset.content_type,
                });
            }
            pulled++;
          }
        } catch (err) {
          console.error(`[sync-check] Failed to fetch/compare ${asset.key}:`, err);
        }
      }));
    }

    // Count assets we skipped entirely (not candidates)
    const skipped = remoteAssets.length - candidates.length;

    return NextResponse.json({
      pulled,
      conflicts,
      unchanged: unchanged + skipped,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
