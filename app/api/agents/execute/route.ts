import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
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
  mode: z.enum(['orchestrated', 'solo']).optional(), // deprecated, kept for backward compat
  subagentCount: z.number().int().min(1).max(4).optional().default(1),
  specialistMode: z.boolean().optional().default(false),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional(),
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
    const rateLimit = await checkRateLimit(request, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'X-RateLimit-Limit': String(rateLimit.limit), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)) } },
      );
    }

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

    // Use service client to bypass RLS — user is already authenticated via requireAuth above.
    // This is needed for MCP requests that use Bearer tokens instead of cookies.
    const serviceClient = createServiceClient();
    const supabase = await createClient();

    // Load project files for context (service client bypasses RLS)
    const { data: files } = await serviceClient
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', body.projectId);

    // Load user preferences
    const { data: preferences } = await serviceClient
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

    const subagentCount = body.subagentCount ?? (body.mode === 'solo' ? 1 : undefined) ?? 1;
    const specialistMode = body.specialistMode ?? (body.mode === 'orchestrated');
    const isSoloMode = subagentCount === 1;

    const executeMethod = isSoloMode
      ? coordinator.executeSolo.bind(coordinator)
      : coordinator.execute.bind(coordinator);

    const result = await executeMethod(
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
        subagentMode: specialistMode ? 'specialist' as const : 'general' as const,
        maxAgents: subagentCount,
        domContext: body.domContext,
        intentMode: body.intentMode,
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
