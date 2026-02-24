import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

interface RouteParams {
  params: Promise<{ projectId: string; messageId: string }>;
}

const feedbackSchema = z.object({
  rating: z.enum(['thumbs_up', 'thumbs_down']),
  comment: z.string().max(2000).optional(),
});

/**
 * POST /api/projects/[projectId]/agent-chat/messages/[messageId]/feedback
 *
 * Submit or update feedback on a message.
 * Body: { rating: 'thumbs_up' | 'thumbs_down', comment?: string }
 * If thumbs_down with comment, also creates a developer_memory entry tagged 'feedback'.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, messageId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid body: rating must be thumbs_up or thumbs_down');
    }
    const { rating, comment } = parsed.data;

    const supabase = await createClient();

    // Try to find the message — the frontend may use a local UUID that doesn't
    // match the DB ID. If not found, still allow feedback to be stored via
    // the developer_memory path.
    let resolvedMessageId = messageId;
    const { data: message } = await supabase
      .from('ai_messages')
      .select('id, session_id')
      .eq('id', messageId)
      .maybeSingle();

    if (!message) {
      // Message not found by exact ID — this is common because the frontend
      // generates local UUIDs. Store feedback via developer_memory only.
      resolvedMessageId = messageId;
    }

    const feedbackAt = new Date().toISOString();

    // Try to update feedback columns — they may not exist if migration hasn't run
    try {
      const { error: updateError } = await supabase
        .from('ai_messages')
        .update({
          feedback_rating: rating,
          feedback_comment: comment ?? null,
          feedback_at: feedbackAt,
        })
        .eq('id', messageId);

      if (updateError && !updateError.message?.includes('column')) {
        throw updateError;
      }
    } catch (err) {
      // Column doesn't exist yet — log but don't fail
      console.warn('[feedback] Could not update ai_messages (migration may be pending):', err);
    }

    // If thumbs_down with comment, create developer_memory entry tagged 'feedback'
    if (rating === 'thumbs_down' && comment?.trim()) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const admin = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('developer_memory') as any)
          .insert({
            project_id: projectId,
            user_id: userId,
            type: 'decision',
            content: {
              tag: 'feedback',
              context: 'Message feedback (thumbs down)',
              choice: comment.trim(),
              reasoning: 'User provided correction',
              timestamp: feedbackAt,
              messageId,
            },
            confidence: 0.7,
          })
          .select()
          .single()
          .catch(() => ({}));
      }
    }

    return successResponse({
      success: true,
      feedback: { rating, comment: comment ?? null },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
