import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { APIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { getFile, updateFile } from '@/lib/services/files';
import {
  runPostApplyDiagnostics,
  type DiagnosticsResult,
} from '@/lib/agents/tools/diagnostics-tool';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const applySchema = z.object({
  fileId: z.string().min(1, 'fileId is required'),
  content: z.string(),
  range: z
    .object({
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
    })
    .optional(),
}).refine(
  (data) => !data.range || data.range.endLine >= data.range.startLine,
  { message: 'endLine must be >= startLine', path: ['range'] },
);

/**
 * Merge new content into a specific line range of the original content.
 * Lines are 1-indexed. Lines from startLine to endLine (inclusive) are replaced.
 */
function applyRange(
  original: string,
  replacement: string,
  range: { startLine: number; endLine: number },
): string {
  const lines = original.split('\n');
  const start = range.startLine - 1;
  const end = range.endLine;

  if (start < 0 || end > lines.length) {
    throw APIError.badRequest(
      `Range ${range.startLine}–${range.endLine} is out of bounds (file has ${lines.length} lines)`,
    );
  }

  const replacementLines = replacement.split('\n');
  lines.splice(start, end - start, ...replacementLines);
  return lines.join('\n');
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await validateBody(applySchema)(request);

    const file = await getFile(body.fileId);
    if (!file) {
      throw APIError.notFound('File not found');
    }

    const originalContent: string = file.content ?? '';

    let finalContent: string;
    if (body.range) {
      finalContent = applyRange(originalContent, body.content, body.range);
    } else {
      finalContent = body.content;
    }

    await updateFile(body.fileId, { content: finalContent });

    const diagnostics: DiagnosticsResult = await runPostApplyDiagnostics(
      file.name ?? file.path ?? body.fileId,
      finalContent,
    );

    return successResponse({ success: true, diagnostics });
  } catch (error) {
    return handleAPIError(error);
  }
}
