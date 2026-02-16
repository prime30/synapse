import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { commitFiles } from '@/lib/git/git-service';
import { createClient as createServiceClient } from '@supabase/supabase-js';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const commitSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).optional(),
});

/**
 * POST /api/projects/[projectId]/git/commit
 * Commit file changes to git.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = commitSchema.safeParse(body);

    if (!parsed.success) {
      throw APIError.badRequest('Invalid request body');
    }

    const { message, files } = parsed.data;

    // Get user profile for commit author info
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const name = profile?.full_name || 'Unknown';
    const email = profile?.email || 'unknown@example.com';

    const sha = await commitFiles({
      projectId,
      message,
      authorName: name,
      authorEmail: email,
      files,
    });

    return successResponse({ sha });
  } catch (error) {
    return handleAPIError(error);
  }
}
