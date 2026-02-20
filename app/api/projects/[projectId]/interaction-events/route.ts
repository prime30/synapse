import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import {
  appendInteractionEvent,
  readInteractionEvents,
  type InteractionEventKind,
} from '@/lib/ai/interaction-logger';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const postSchema = z.object({
  kind: z.enum(['user_input', 'assistant_output', 'button_click', 'mode_change', 'system'] satisfies [InteractionEventKind, ...InteractionEventKind[]]),
  sessionId: z.string().uuid().nullable().optional(),
  source: z.string().max(100).optional(),
  label: z.string().max(200).optional(),
  content: z.string().max(20000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/projects/[projectId]/interaction-events
 * Read recent interaction events for training/debugging.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10);
    const limit = Number.isFinite(limitParam) ? limitParam : 200;
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId');
    const sessionId = sessionIdParam && sessionIdParam.length > 0 ? sessionIdParam : null;

    const events = await readInteractionEvents(projectId, { limit, sessionId });
    return successResponse({ events, total: events.length });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/interaction-events
 * Append a new interaction event.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid interaction event payload');
    }

    const saved = await appendInteractionEvent(projectId, parsed.data);
    return successResponse(saved, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
