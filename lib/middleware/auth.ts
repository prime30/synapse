import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APIError } from '@/lib/errors/handler';

/** Supabase client that reads auth from the request cookies (anon key + RLS). */
function anonClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );
}

/**
 * Supabase client that bypasses RLS (service role key).
 * Falls back to the anon client when the service role key isn't configured.
 */
function adminClient(request?: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  // Fallback: use anon + cookies (will go through RLS)
  if (request) return anonClient(request);
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when no request is available');
}

export async function requireAuth(request: NextRequest): Promise<string> {
  const supabase = anonClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw APIError.unauthorized();
  }

  return user.id;
}

export async function requireOrgAccess(
  request: NextRequest,
  organizationId: string
): Promise<string> {
  const userId = await requireAuth(request);
  const supabase = adminClient(request);

  const { data: member } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (!member) {
    throw APIError.forbidden('Not a member of this organization');
  }

  return userId;
}

export async function requireProjectAccess(
  request: NextRequest,
  projectId: string
): Promise<string> {
  const userId = await requireAuth(request);

  // Use admin client to bypass RLS — the user is already authenticated above.
  const supabase = adminClient(request);

  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    throw APIError.notFound('Project not found');
  }

  const { data: member } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', project.organization_id)
    .eq('user_id', userId)
    .single();

  if (!member) {
    throw APIError.forbidden('No access to this project');
  }

  return userId;
}
