import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { domCache } from '@/lib/context/dom-cache';

/**
 * POST /api/projects/[projectId]/preview/inspect
 *
 * Proxy for DOM inspection requests. The frontend bridge client resolves
 * these via postMessage to the preview iframe and returns the result.
 *
 * For server-side callers (MCP), this endpoint returns cached DOM context
 * if available, or a 202 indicating the caller should retry after the
 * frontend has populated the cache.
 *
 * Body: { action: string, selector?: string }
 * 
 * Supported actions: inspect, listAppElements, getStylesheets,
 * getPageSnapshot, querySelector
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : null;
    const selector = typeof body.selector === 'string' ? body.selector : undefined;

    if (!action) {
      throw APIError.badRequest('action is required');
    }

    const validActions = ['inspect', 'listAppElements', 'getStylesheets', 'getPageSnapshot', 'querySelector', 'getConsoleLogs', 'getNetworkRequests'];
    if (!validActions.includes(action)) {
      throw APIError.badRequest(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
    }

    if ((action === 'inspect' || action === 'querySelector') && !selector) {
      throw APIError.badRequest('selector is required for this action');
    }

    // getConsoleLogs and getNetworkRequests use optional search param from body for cache key
    const search = (action === 'getConsoleLogs' || action === 'getNetworkRequests') && typeof body.search === 'string' ? body.search : undefined;
    const cacheKey = (action === 'getConsoleLogs' || action === 'getNetworkRequests') ? search : selector;

    // Check cache first
    const cached = await domCache.get(projectId, action, cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    // If the frontend has stored data via the populate endpoint, it would be in cache.
    // For MCP callers, return 202 to indicate "not yet available, populate via frontend first"
    return NextResponse.json(
      {
        success: false,
        error: 'DOM context not cached. The preview must be open and the bridge active.',
        hint: 'Open the project preview panel, then retry.',
        action,
        selector,
      },
      { status: 202 }
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * PUT /api/projects/[projectId]/preview/inspect
 *
 * Called by the frontend to populate the DOM cache with bridge results.
 * This allows server-side callers (MCP, agent pipeline) to read cached DOM data.
 *
 * Body: { action: string, selector?: string, data: unknown }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : null;
    const selector = typeof body.selector === 'string' ? body.selector : undefined;
    const search = (action === 'getConsoleLogs' || action === 'getNetworkRequests') && typeof body.search === 'string' ? body.search : undefined;
    const cacheKey = (action === 'getConsoleLogs' || action === 'getNetworkRequests') ? search : selector;
    const data = body.data;

    if (!action || data === undefined) {
      throw APIError.badRequest('action and data are required');
    }

    await domCache.set(projectId, action, data, cacheKey);

    return NextResponse.json({ success: true, cached: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
