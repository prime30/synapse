import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { createBatch, pollBatch, cancelBatch, getBatchResults, type BatchRequest } from '@/lib/ai/batch-client';
import { AI_FEATURES } from '@/lib/ai/feature-flags';

/**
 * POST /api/projects/[projectId]/batch
 *
 * Create a new batch processing job.
 * Returns { batchId, status: 'processing' } immediately.
 *
 * Body: { requests: BatchRequest[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    if (!AI_FEATURES.batchProcessing) {
      return NextResponse.json(
        { error: 'Batch processing is not enabled' },
        { status: 403 },
      );
    }

    const body = await request.json() as { requests?: BatchRequest[] };
    if (!body.requests?.length) {
      return NextResponse.json(
        { error: 'No requests provided' },
        { status: 400 },
      );
    }

    const job = await createBatch(body.requests);

    return NextResponse.json({
      batchId: job.id,
      status: job.processing_status,
      projectId,
      requestCounts: job.request_counts,
      createdAt: job.created_at,
    });
  } catch (error) {
    console.error('[batch] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/projects/[projectId]/batch?batchId=xxx
 *
 * Poll a batch job status. When complete, includes results.
 */
export async function GET(
  request: NextRequest,
) {
  try {
    await requireAuth(request);

    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json(
        { error: 'batchId query parameter is required' },
        { status: 400 },
      );
    }

    const job = await pollBatch(batchId);
    const response: Record<string, unknown> = {
      batchId: job.id,
      status: job.processing_status,
      requestCounts: job.request_counts,
      createdAt: job.created_at,
      endedAt: job.ended_at,
    };

    // Include results if the batch is complete
    if (job.processing_status === 'ended' && job.results_url) {
      try {
        response.results = await getBatchResults(batchId);
      } catch (resultsError) {
        console.error('[batch] Failed to fetch results:', resultsError);
        response.resultsError = 'Failed to fetch results';
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[batch] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/batch?batchId=xxx
 *
 * Cancel a running batch job.
 */
export async function DELETE(
  request: NextRequest,
) {
  try {
    await requireAuth(request);

    const batchId = request.nextUrl.searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json(
        { error: 'batchId query parameter is required' },
        { status: 400 },
      );
    }

    const job = await cancelBatch(batchId);

    return NextResponse.json({
      batchId: job.id,
      status: job.processing_status,
    });
  } catch (error) {
    console.error('[batch] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
