/**
 * Inline (ghost) code completion for the editor — Cursor Tab–like.
 * Uses a fast model to suggest the next few lines at the cursor.
 * See .cursor/plans/cursor-like-features-plan.md (Track A).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/get-provider';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';

const bodySchema = z.object({
  /** Text before the cursor (prefix). Keep under ~2k chars for latency. */
  prefix: z.string().max(8000),
  /** Text after the cursor (suffix). Keep under ~500 chars. */
  suffix: z.string().max(2000).optional().default(''),
  /** File path for context (e.g. sections/hero.liquid). */
  path: z.string().max(512).optional(),
  /** Language: liquid | javascript | css. */
  language: z.enum(['liquid', 'javascript', 'css']).optional().default('liquid'),
  /** Prefer fast provider: google (Gemini Flash) or anthropic (Haiku). */
  provider: z.enum(['google', 'anthropic']).optional().default('google'),
});

const INLINE_SYSTEM = `You are a code completion model. Complete the code at the cursor. Output ONLY the completion text: no explanation, no markdown, no code fences. Do not repeat the existing code.`;

function buildUserPrompt(params: z.infer<typeof bodySchema>): string {
  const { prefix, suffix, language, path } = params;
  const pathLine = path ? `File: ${path}\n` : '';
  return `${pathLine}Language: ${language}\n\nComplete the following at the cursor. Output only the completion.\n\n---\n${prefix}${suffix ? `\n---\n(rest of file)\n${suffix}` : ''}`;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const rateLimit = await checkRateLimit(request, { windowMs: 60000, maxRequests: 60 });
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      });
    }

    const body = await validateBody(bodySchema)(request);
    const provider = getAIProvider(body.provider);

    const model = body.provider === 'google'
      ? 'gemini-2.0-flash'
      : 'claude-3-5-haiku-20241022';

    const result = await provider.complete(
      [
        { role: 'system', content: INLINE_SYSTEM },
        { role: 'user', content: buildUserPrompt(body) },
      ],
      {
        model,
        maxTokens: 256,
        temperature: 0.2,
      }
    );

    const raw = (result.content ?? '').trim();
    const completion = raw.replace(/^```[\w]*\n?|\n?```$/g, '').trim();

    return successResponse({ completion: completion || null });
  } catch (error) {
    return handleAPIError(error);
  }
}
