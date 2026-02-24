import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { generatePolicy } from '@/lib/policy-designer/ai-generator';

const schema = z.object({
  type: z.enum(['return', 'privacy', 'terms', 'shipping', 'contact']),
  storeName: z.string().min(1),
  email: z.string().email().optional(),
  industry: z.string().optional(),
  specialNotes: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const body = await validateBody(schema)(request);
    const html = await generatePolicy(body.type, body);
    return successResponse({ html });
  } catch (error) {
    return handleAPIError(error);
  }
}
