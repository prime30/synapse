import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';

const executeSchema = z.object({
  projectId: z.string().uuid(),
  request: z.string().min(1, 'Request is required'),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    checkRateLimit(request, { windowMs: 60000, maxRequests: 10 });

    const body = await validateBody(executeSchema)(request);
    const supabase = await createClient();

    // Load project files for context
    const { data: files } = await supabase
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', body.projectId);

    // Load user preferences
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId);

    const fileContexts = (files ?? []).map((f) => ({
      fileId: f.id,
      fileName: f.name,
      fileType: f.file_type as 'liquid' | 'javascript' | 'css' | 'other',
      content: f.content ?? '',
    }));

    const executionId = crypto.randomUUID();
    const coordinator = new AgentCoordinator();

    const result = await coordinator.execute(
      executionId,
      body.projectId,
      userId,
      body.request,
      fileContexts,
      preferences ?? []
    );

    return successResponse({
      executionId,
      ...result,
    }, result.success ? 200 : 422);
  } catch (error) {
    return handleAPIError(error);
  }
}
