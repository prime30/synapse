import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const { data: sessions, error } = await supabase
      .from('ai_sessions')
      .select('provider, model, total_input_tokens, total_output_tokens')
      .eq('user_id', userId);

    if (error) throw error;

    const usage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byProvider: {} as Record<string, { inputTokens: number; outputTokens: number }>,
    };

    for (const session of sessions ?? []) {
      usage.totalInputTokens += session.total_input_tokens;
      usage.totalOutputTokens += session.total_output_tokens;

      if (!usage.byProvider[session.provider]) {
        usage.byProvider[session.provider] = { inputTokens: 0, outputTokens: 0 };
      }
      usage.byProvider[session.provider].inputTokens += session.total_input_tokens;
      usage.byProvider[session.provider].outputTokens += session.total_output_tokens;
    }

    return successResponse(usage);
  } catch (error) {
    return handleAPIError(error);
  }
}
