import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { streamV2 } from '@/lib/agents/coordinator-v2';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { checkUsageAllowance } from '@/lib/billing/usage-guard';

const executeSchema = z.object({
  projectId: z.string().uuid(),
  request: z.string().min(1, 'Request is required'),
  domContext: z.string().optional(),
  action: z.enum([
    'analyze', 'generate', 'review', 'summary', 'fix',
    'explain', 'refactor', 'document', 'plan', 'chat',
  ] as const).optional(),
  model: z.string().optional(),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional(),
});

/**
 * POST /api/agents/execute
 *
 * Non-streaming agent execution via the V2 coordinator. Returns the full result.
 * Used by the MCP server and other non-streaming clients.
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

    const serviceClient = createServiceClient();
    const { allFiles: fileContexts } = await loadProjectFiles(body.projectId, serviceClient);

    const executionId = crypto.randomUUID();

    const result = await streamV2(
      executionId,
      body.projectId,
      userId,
      body.request,
      fileContexts,
      [],
      {
        intentMode: body.intentMode ?? 'code',
        model: body.model,
        domContext: body.domContext,
      },
    );

    return successResponse({
      executionId,
      ...result,
    }, result.success ? 200 : 422);
  } catch (error) {
    return handleAPIError(error);
  }
}
