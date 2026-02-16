import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { pullFromRemote } from '@/lib/git/github-sync';
import { getToken } from '@/lib/git/github-token-manager';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const pullSchema = z.object({
  remoteName: z.string().optional(),
  branch: z.string().optional(),
  token: z.string().optional(),
});

/**
 * POST /api/projects/[projectId]/git/pull
 * Pull changes from a remote repository
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await validateBody(pullSchema)(request);
    const storedToken = await getToken(userId, projectId);
    const token = body.token ?? storedToken?.accessToken ?? null;
    if (!token) {
      throw APIError.badRequest('GitHub token is required. Connect your GitHub account in project settings.', 'TOKEN_REQUIRED');
    }

    // Get user profile for author name and email
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const { data: { user } } = await supabase.auth.getUser();

    const authorName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Synapse User';
    const authorEmail = profile?.email || user?.email || 'user@synapse.dev';

    const result = await pullFromRemote({
      projectId,
      remoteName: body.remoteName,
      branch: body.branch,
      token,
      authorName,
      authorEmail,
    });

    if (!result.ok) {
      return successResponse({ ok: false, conflicts: result.conflicts ?? [] });
    }

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
