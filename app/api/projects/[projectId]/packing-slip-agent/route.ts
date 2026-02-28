import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { getAIProvider } from '@/lib/ai/get-provider';
import { MODELS } from '@/lib/agents/model-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  template: z.string().min(1),
  request: z.string().min(1),
  images: z.array(
    z.object({
      base64: z.string().min(1),
      mimeType: z.string().min(1),
    }),
  ).optional().default([]),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ).optional().default([]),
  provider: z.enum(['openai', 'anthropic', 'xai']).optional(),
  model: z.string().optional(),
});

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const SYSTEM_PROMPT =
  'You are a specialized Shopify packing-slip editor agent. ' +
  'You work only on a single in-memory template, never on repository files. ' +
  'Your workflow is: see current template, edit it, refine design, verify output. ' +
  'Always return the full updated packing slip template in one ```liquid code block```. ' +
  'After the code block, include a short "Verification" bullet list (3-5 bullets) describing what you validated. ' +
  'Do not ask for file paths or mention code-edit tools.';

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth(request);
    await params;

    const rate = await checkRateLimit(request, { windowMs: 60_000, maxRequests: 30 });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await validateBody(schema)(request);
    // Dedicated default for packing-slip agent: Grok 4.1 Fast.
    // Fall back to Anthropic only when XAI key is unavailable.
    const resolvedProvider = process.env.XAI_API_KEY ? 'xai' : (body.provider ?? 'anthropic');
    const resolvedModel = process.env.XAI_API_KEY ? MODELS.GROK_FAST : (body.model ?? MODELS.CLAUDE_SONNET);
    const provider = getAIProvider(resolvedProvider);

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...body.history.slice(-8),
      {
        role: 'user' as const,
        content:
          `CURRENT TEMPLATE:\n\`\`\`liquid\n${body.template}\n\`\`\`\n\n` +
          `REQUEST:\n${body.request}`,
        images: body.images,
      },
    ];

    const { stream } = await provider.stream(messages, {
      model: resolvedModel,
      temperature: 0.2,
      maxTokens: 3000,
    });

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    const reader = stream.getReader();

    const sse = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>) => {
          controller.enqueue(textEncoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = typeof value === 'string' ? value : textDecoder.decode(value);
            if (!chunk) continue;
            emit({ type: 'content_chunk', chunk });
          }
          controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          emit({ type: 'content_chunk', chunk: '\n\nI hit a streaming error while generating the template.' });
          controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(sse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to run packing slip agent' }, { status: 500 });
  }
}

