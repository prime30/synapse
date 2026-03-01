import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { standardizeTheme } from '@/lib/design-tokens/standardization/theme-standardizer';
import type { StandardizationAudit } from '@/lib/design-tokens/standardization/types';

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                       */
/* ------------------------------------------------------------------ */

type StandardizePhase = 'scanning' | 'classifying' | 'complete';

interface ProgressEvent {
  type: 'progress';
  phase: StandardizePhase;
  message: string;
  percent: number;
}

interface CompleteEvent {
  type: 'complete';
  data: StandardizationAudit;
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

type SSEEvent = ProgressEvent | CompleteEvent | ErrorEvent;

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/* ------------------------------------------------------------------ */
/*  POST — Run standardization audit with SSE progress                */
/* ------------------------------------------------------------------ */

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  try {
    await requireProjectAccess(request, projectId);
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        if (abortSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          /* controller may be closed */
        }
      };

      try {
        send({
          type: 'progress',
          phase: 'scanning',
          message: 'Scanning project files...',
          percent: 0,
        });

        send({
          type: 'progress',
          phase: 'classifying',
          message: 'Classifying hardcoded values...',
          percent: 50,
        });

        const audit = await standardizeTheme(projectId);

        if (abortSignal.aborted) {
          controller.close();
          return;
        }

        send({
          type: 'complete',
          data: audit,
        });

        controller.close();
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Standardization failed',
        });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
