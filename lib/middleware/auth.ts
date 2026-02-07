import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { APIError } from '@/lib/errors/handler';

export async function requireAuth(request: NextRequest): Promise<string> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Cannot set cookies in API routes via this path
        },
      },
    }
  );

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

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
