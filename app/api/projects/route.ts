import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

/**
 * GET /api/projects
 * List all projects accessible to the current user.
 * Tries the list_user_projects RPC first (avoids schema-cache issues);
 * falls back to direct .from('projects') query if the RPC doesn't exist.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = await createClient();

    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'list_user_projects'
    );

    if (!rpcError) {
      return successResponse(rpcData ?? []);
    }

    // If the RPC doesn't exist (migration not applied), fall back to direct query
    if (RPC_NOT_FOUND.test(rpcError.message ?? '')) {
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('id, name, description, created_at, updated_at, organization_id')
        .order('updated_at', { ascending: false });

      if (projError) {
        throw APIError.internal(projError.message);
      }

      return successResponse(projects ?? []);
    }

    throw APIError.internal(rpcError.message);
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
