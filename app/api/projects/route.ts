import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

/**
 * GET /api/projects
 * List all projects accessible to the current user.
 * Tries the list_user_projects RPC first (avoids schema-cache issues);
 * on any RPC error, falls back to listing via org membership with service role.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'list_user_projects'
    );

    if (!rpcError) {
      return successResponse(rpcData ?? []);
    }

    // Fallback: use service role to list projects by org membership (bypasses RLS/schema cache)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
      );

      try {
        const { data: members, error: memError } = await admin
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', userId);

        if (memError || !members?.length) {
          return successResponse([]);
        }

        const orgIds = [...new Set(members.map((m) => m.organization_id))];
        // Optional: filter by store connection
        const connectionId = request.nextUrl.searchParams.get('connectionId');

        const selectCols = 'id, name, description, created_at, updated_at, organization_id, shopify_store_url, shopify_connection_id, shopify_theme_id, shopify_theme_name, dev_theme_id, status, thumbnail_url';
        const selectColsNoStatus = 'id, name, description, created_at, updated_at, organization_id, shopify_store_url, shopify_connection_id, shopify_theme_id, shopify_theme_name, dev_theme_id, thumbnail_url';
        const selectColsFallback = 'id, name, description, created_at, updated_at, organization_id, shopify_store_url, shopify_connection_id, shopify_theme_id, shopify_theme_name';

        let projectsQuery = admin
          .from('projects')
          .select(selectCols)
          .in('organization_id', orgIds)
          .order('updated_at', { ascending: false });

        if (connectionId) {
          projectsQuery = projectsQuery.eq('shopify_connection_id', connectionId);
        }

        let { data: projects, error: projError } = await projectsQuery;

        // If status column doesn't exist yet (pre-migration), retry without it
        if (projError && (projError.code === '42703' || (projError.message ?? '').includes('status'))) {
          let noStatusQuery = admin
            .from('projects')
            .select(selectColsNoStatus)
            .in('organization_id', orgIds)
            .order('updated_at', { ascending: false });
          if (connectionId) {
            noStatusQuery = noStatusQuery.eq('shopify_connection_id', connectionId);
          }
          const noStatusResult = await noStatusQuery;
          projects = (noStatusResult.data ?? []).map((p) => ({ ...p, status: null }));
          projError = noStatusResult.error;
        }

        // If dev_theme_id column doesn't exist yet (pre-migration), retry without it
        if (projError && (projError.code === '42703' || (projError.message ?? '').includes('dev_theme_id'))) {
          let fallbackQuery = admin
            .from('projects')
            .select(selectColsFallback)
            .in('organization_id', orgIds)
            .order('updated_at', { ascending: false });
          if (connectionId) {
            fallbackQuery = fallbackQuery.eq('shopify_connection_id', connectionId);
          }
          const fallback = await fallbackQuery;
          projects = (fallback.data ?? []).map((p) => ({ ...p, dev_theme_id: null, status: null }));
          projError = fallback.error;
        }

        if (projError) {
          // Table might not exist yet — return empty gracefully
          const msg = (projError.message ?? '').toLowerCase();
          if (msg.includes('relation') || msg.includes('does not exist') || projError.code === '42P01') {
            return successResponse([]);
          }
          throw APIError.internal(projError.message);
        }

        return successResponse(projects ?? []);
      } catch (fallbackError) {
        // If org_members or projects table doesn't exist, return empty
        const msg = fallbackError instanceof Error ? fallbackError.message.toLowerCase() : '';
        if (msg.includes('relation') || msg.includes('does not exist')) {
          return successResponse([]);
        }
        throw fallbackError;
      }
    }

    // If the RPC doesn't exist and no service key, try direct query with anon client
    if (RPC_NOT_FOUND.test(rpcError.message ?? '')) {
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('id, name, description, created_at, updated_at, organization_id')
        .order('updated_at', { ascending: false });

      if (projError) {
        // Table might not exist yet — return empty gracefully
        const msg = (projError.message ?? '').toLowerCase();
        if (msg.includes('relation') || msg.includes('does not exist') || projError.code === '42P01') {
          return successResponse([]);
        }
        throw APIError.internal(projError.message);
      }

      return successResponse(projects ?? []);
    }

    // RPC failed for a reason other than "not found" — return empty rather than 500
    return successResponse([]);
  } catch (error) {
    return handleAPIError(error);
  }
}

const RPC_NOT_FOUND =
  /could not find the function|schema cache|function.*does not exist/i;

/**
 * Fallback when create_first_project RPC is not in the DB (migration not applied).
 * Creates personal org if needed, then project, using the same logic as the RPC.
 */
async function createFirstProjectFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  description: string | undefined,
): Promise<{ id: string; name: string }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    throw APIError.unauthorized('Not authenticated');
  }

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  let orgId = member?.organization_id;

  if (!orgId) {
    const slug = `personal-${crypto.randomUUID().replace(/-/g, '')}`;
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: 'Personal', slug, owner_id: user.id })
      .select('id')
      .single();
    if (orgError || !org?.id) {
      throw APIError.internal(orgError?.message ?? 'Failed to create organization');
    }
    orgId = org.id;
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name,
      description: description ?? null,
      organization_id: orgId,
      owner_id: user.id,
    })
    .select('id, name')
    .single();

  if (projectError || !project?.id) {
    throw APIError.internal(projectError?.message ?? 'Failed to create project');
  }

  return { id: project.id, name: project.name ?? name };
}

/**
 * POST /api/projects
 * Create a new project via RPC when available; otherwise fallback to direct inserts.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 255)
        : 'My project';
    const description =
      typeof body.description === 'string' ? body.description.slice(0, 2000) : undefined;

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('create_first_project', {
      p_name: name,
      p_description: description ?? null,
    });

    if (error) {
      if (RPC_NOT_FOUND.test(error.message ?? '')) {
        const result = await createFirstProjectFallback(supabase, name, description);
        return successResponse(result);
      }
      throw APIError.internal(error.message ?? 'Failed to create project');
    }

    const result = data as { id?: string; name?: string } | null;
    if (!result?.id) {
      throw APIError.internal('No project ID returned');
    }

    return successResponse({
      id: result.id,
      name: result.name ?? name,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
