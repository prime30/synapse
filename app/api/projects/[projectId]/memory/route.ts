import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type {
  MemoryType,
  MemoryFeedback,
  MemoryContent,
  MemoryRow,
} from '@/lib/ai/developer-memory';
import { rowToMemoryEntry } from '@/lib/ai/developer-memory';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function adminClient(): ReturnType<typeof createServiceClient> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !serviceKey) {
    throw APIError.serviceUnavailable('Developer memory not configured');
  }
  return createServiceClient(url, serviceKey);
}

const VALID_TYPES = new Set<MemoryType>(['convention', 'decision', 'preference']);
const VALID_FEEDBACK = new Set<MemoryFeedback | 'null'>(['correct', 'wrong', 'null']);

/* ------------------------------------------------------------------ */
/*  GET — List memories for a project                                  */
/* ------------------------------------------------------------------ */

/**
 * GET /api/projects/[projectId]/memory
 *
 * Query params:
 *  - type: filter by memory type (convention | decision | preference)
 *  - feedback: filter by feedback (correct | wrong | null)
 *  - minConfidence: minimum confidence threshold (0-1)
 *  - limit: max results (default 50, max 200)
 *  - offset: pagination offset
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const url = request.nextUrl;
    const typeFilter = url.searchParams.get('type') as MemoryType | null;
    const feedbackFilter = url.searchParams.get('feedback');
    const minConfidence = parseFloat(url.searchParams.get('minConfidence') ?? '0');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const supabase = adminClient();

    let query = supabase
      .from('developer_memory')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .gte('confidence', isNaN(minConfidence) ? 0 : minConfidence)
      .order('confidence', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeFilter && VALID_TYPES.has(typeFilter)) {
      query = query.eq('type', typeFilter);
    }

    if (feedbackFilter === 'null') {
      query = query.is('feedback', null);
    } else if (feedbackFilter && VALID_FEEDBACK.has(feedbackFilter as MemoryFeedback)) {
      query = query.eq('feedback', feedbackFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      // Table might not exist yet — return empty gracefully
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || error.code === '42P01') {
        return successResponse({ memories: [], total: 0 });
      }
      throw APIError.internal(error.message);
    }

    const memories = (data as MemoryRow[]).map(rowToMemoryEntry);

    return successResponse({
      memories,
      total: count ?? memories.length,
      limit,
      offset,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Create a new memory entry                                   */
/* ------------------------------------------------------------------ */

/**
 * POST /api/projects/[projectId]/memory
 *
 * Body:
 *  - type: 'convention' | 'decision' | 'preference'
 *  - content: MemoryContent (Convention | Decision | Preference)
 *  - confidence: number (0-1)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));

    // Validate type
    const type = body.type as MemoryType;
    if (!type || !VALID_TYPES.has(type)) {
      throw APIError.badRequest('Invalid memory type. Must be: convention, decision, or preference');
    }

    // Validate content
    const content = body.content as MemoryContent;
    if (!content || typeof content !== 'object') {
      throw APIError.badRequest('content must be a non-empty object');
    }

    // Validate confidence
    const confidence = typeof body.confidence === 'number' ? body.confidence : 0.5;
    if (confidence < 0 || confidence > 1) {
      throw APIError.badRequest('confidence must be between 0 and 1');
    }

    const supabase = adminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('developer_memory') as any)
      .insert({
        project_id: projectId,
        user_id: userId,
        type,
        content,
        confidence,
      })
      .select()
      .single();

    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (
        msg.includes('relation') ||
        msg.includes('does not exist') ||
        error.code === '42P01' ||
        msg.includes('column') ||
        msg.includes('violates')
      ) {
        return successResponse(
          { message: 'Developer memory not available' },
          503
        );
      }
      throw APIError.internal(error.message);
    }

    return successResponse(rowToMemoryEntry(data as MemoryRow), 201);
  } catch (error) {
    return handleAPIError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update feedback on a memory entry                          */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/projects/[projectId]/memory
 *
 * Body:
 *  - id: memory entry UUID
 *  - feedback?: 'correct' | 'wrong' | null
 *  - content?: updated MemoryContent
 *  - confidence?: updated confidence
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));

    const memoryId = body.id;
    if (!memoryId || typeof memoryId !== 'string') {
      throw APIError.badRequest('id is required');
    }

    // Build update payload
    const updates: Record<string, unknown> = {};

    if ('feedback' in body) {
      const fb = body.feedback;
      if (fb !== null && fb !== 'correct' && fb !== 'wrong') {
        throw APIError.badRequest('feedback must be "correct", "wrong", or null');
      }
      updates.feedback = fb;
    }

    if ('content' in body && typeof body.content === 'object' && body.content !== null) {
      updates.content = body.content;
    }

    if ('confidence' in body && typeof body.confidence === 'number') {
      if (body.confidence < 0 || body.confidence > 1) {
        throw APIError.badRequest('confidence must be between 0 and 1');
      }
      updates.confidence = body.confidence;
    }

    if (Object.keys(updates).length === 0) {
      throw APIError.badRequest('No valid fields to update');
    }

    const supabase = adminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('developer_memory') as any)
      .update(updates)
      .eq('id', memoryId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw APIError.notFound('Memory entry not found');
      }
      throw APIError.internal(error.message);
    }

    return successResponse(rowToMemoryEntry(data as MemoryRow));
  } catch (error) {
    return handleAPIError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Forget a memory entry                                     */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/projects/[projectId]/memory
 *
 * Body:
 *  - id: memory entry UUID
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));

    const memoryId = body.id;
    if (!memoryId || typeof memoryId !== 'string') {
      throw APIError.badRequest('id is required');
    }

    const supabase = adminClient();

    const { error } = await supabase
      .from('developer_memory')
      .delete()
      .eq('id', memoryId)
      .eq('project_id', projectId);

    if (error) {
      throw APIError.internal(error.message);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
