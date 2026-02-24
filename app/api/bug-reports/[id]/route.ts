import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'fixed', 'archived']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  agentSessionId: z.string().uuid().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAdmin(request);
    const { id } = await params;
    const supabase = await createClient();

    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid update');
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'fixed') {
        updates.fixed_by = userId;
        updates.fixed_at = new Date().toISOString();
      }
    }
    if (parsed.data.severity) updates.severity = parsed.data.severity;
    if (parsed.data.agentSessionId) updates.agent_session_id = parsed.data.agentSessionId;

    const { data, error } = await supabase
      .from('bug_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw APIError.notFound('Bug report not found');

    return successResponse(data);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
