import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; sessionId: string }>;
}

const applyStatsSchema = z.object({
  linesAdded: z.number().int().min(0).max(1_000_000),
  linesDeleted: z.number().int().min(0).max(1_000_000),
  filesAffected: z.number().int().min(0).max(10_000),
});

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/apply-stats
 *
 * Increment the session's diff stats after a code block is applied.
 * Values are added to existing totals (not replaced).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    // Verify ownership
    const { data: session, error: verifyError } = await supabase
      .from('ai_sessions')
      .select('id, lines_added, lines_deleted, files_affected')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (verifyError) throw verifyError;
    if (!session) throw APIError.notFound('Session not found');

    const body = await request.json().catch(() => ({}));
    const parsed = applyStatsSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid stats: linesAdded, linesDeleted, filesAffected required (non-negative integers)');
    }

    const { linesAdded, linesDeleted, filesAffected } = parsed.data;

    const { error: updateError } = await supabase
      .from('ai_sessions')
      .update({
        lines_added: (session.lines_added ?? 0) + linesAdded,
        lines_deleted: (session.lines_deleted ?? 0) + linesDeleted,
        files_affected: (session.files_affected ?? 0) + filesAffected,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    return successResponse({
      id: sessionId,
      linesAdded: (session.lines_added ?? 0) + linesAdded,
      linesDeleted: (session.lines_deleted ?? 0) + linesDeleted,
      filesAffected: (session.files_affected ?? 0) + filesAffected,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
