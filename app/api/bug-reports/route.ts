import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  screenshotUrl: z.string().url().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const projectId = request.nextUrl.searchParams.get('projectId');
    const status = request.nextUrl.searchParams.get('status');

    let query = supabase
      .from('bug_reports')
      .select('*, profiles:user_id(full_name, email, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return successResponse({ reports: data ?? [] });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid bug report: title and projectId required');
    }

    const { data, error } = await supabase
      .from('bug_reports')
      .insert({
        project_id: parsed.data.projectId,
        user_id: userId,
        title: parsed.data.title,
        description: parsed.data.description,
        screenshot_url: parsed.data.screenshotUrl ?? null,
        severity: parsed.data.severity,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
