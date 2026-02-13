import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';
import { recordUsageBatch } from '@/lib/billing/usage-recorder';
import { checkUsageAllowance } from '@/lib/billing/usage-guard';
import type { AIAction } from '@/lib/agents/model-router';

const executeSchema = z.object({
  projectId: z.string().uuid(),
  request: z.string().min(1, 'Request is required'),
  // EPIC 1a: Accept domContext from preview bridge
  domContext: z.string().optional(),
  action: z.enum([
    'analyze', 'generate', 'review', 'summary', 'fix',
    'explain', 'refactor', 'document', 'plan', 'chat',
  ] as const).optional(),
  model: z.string().optional(),
  mode: z.enum(['orchestrated', 'solo']).optional(),
});

/**
 * POST /api/agents/execute
 *
 * Non-streaming agent execution. Returns the full result.
 *
 * EPIC 1a: Accepts domContext, action, model, mode in request body.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    checkRateLimit(request, { windowMs: 60000, maxRequests: 10 });

    // ── Usage guard (B4): enforce plan limits before running agents ──
    const usageCheck = await checkUsageAllowance(userId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'usage_limit',
          message: usageCheck.reason,
          upgradeUrl: '/account/billing',
        },
        { status: 402 },
      );
    }

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
      path: f.path ?? undefined,
    }));

    const executionId = crypto.randomUUID();
    const coordinator = new AgentCoordinator();

    const result = await coordinator.execute(
      executionId,
      body.projectId,
      userId,
      body.request,
      fileContexts,
      preferences ?? [],
      {
        action: body.action as AIAction | undefined,
        model: body.model,
        mode: body.mode,
        domContext: body.domContext,
      },
    );

    // ── Token usage recording (B1 + B4) ─────────────────────────────────
    // Fire-and-forget: never let recording failures break the response.
    // Uses usageCheck from the guard for org ID, isIncluded, and isByok.
    const orgId = usageCheck.organizationId || null;
    try {
      if (orgId) {
        const usage = coordinator.getAccumulatedUsage();
        const records = usage.perAgent.map((entry) => ({
          organizationId: orgId,
          userId,
          projectId: body.projectId,
          executionId,
          provider: entry.provider,
          model: entry.model,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          isByok: usageCheck.isByok,
          isIncluded: usageCheck.isIncluded,
          requestType: entry.agentType === 'review' ? 'review' as const : 'agent' as const,
        }));
        // Don't await — let it run in the background
        recordUsageBatch(records).catch((err) =>
          console.error('[execute] usage recording failed:', err),
        );
      }
    } catch (err) {
      console.error('[execute] usage recording setup failed:', err);
    }

    return successResponse({
      executionId,
      ...result,
    }, result.success ? 200 : 422);
  } catch (error) {
    return handleAPIError(error);
  }
}
