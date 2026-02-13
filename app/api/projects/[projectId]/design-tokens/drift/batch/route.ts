import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { DriftDetector } from '@/lib/design-tokens/drift/drift-detector';
import { listProjectFiles, getFile } from '@/lib/services/files';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/** File extensions eligible for drift analysis. */
const DRIFTABLE_EXT = /\.(css|scss|less|liquid|js|jsx|ts|tsx)$/i;

/** Max files per batch to prevent timeouts. */
const MAX_FILES = 100;

/* ------------------------------------------------------------------ */
/*  POST — Batch drift detection across project files                  */
/* ------------------------------------------------------------------ */

/**
 * POST /api/projects/[projectId]/design-tokens/drift/batch
 *
 * Runs drift detection across many theme files in a single request.
 *
 * Body: `{ filePaths?: string[] }`
 *   - If `filePaths` is omitted or empty, all driftable project files are used.
 *   - Capped at 100 files.
 *
 * Returns `{ results: DriftResult[] }`.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    // Parse body (graceful default)
    let body: { filePaths?: string[] } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine — use all files
    }

    // 1. List all project files (metadata only — no content)
    const allFiles = await listProjectFiles(projectId);
    if (!allFiles || allFiles.length === 0) {
      return successResponse({ results: [] });
    }

    // 2. Filter to driftable extensions
    let candidates = allFiles.filter((f) => {
      const path = (f.path ?? f.name) as string;
      return DRIFTABLE_EXT.test(path);
    });

    // 3. Narrow by requested paths (if any)
    if (Array.isArray(body.filePaths) && body.filePaths.length > 0) {
      const pathSet = new Set(body.filePaths.map((p) => p.toLowerCase()));
      candidates = candidates.filter((f) => {
        const path = ((f.path ?? f.name) as string).toLowerCase();
        return pathSet.has(path);
      });
    }

    // 4. Cap at MAX_FILES
    candidates = candidates.slice(0, MAX_FILES);

    // 5. Load content and run drift detection
    const detector = new DriftDetector();
    const results = await Promise.all(
      candidates.map(async (file) => {
        try {
          const fullFile = await getFile(file.id as string);
          const content = fullFile?.content;
          if (typeof content !== 'string' || content.length === 0) return null;

          const filePath = (file.path ?? file.name) as string;
          return await detector.detectDrift(projectId, content, filePath);
        } catch {
          return null; // skip unreadable files
        }
      }),
    );

    return successResponse({
      results: results.filter(Boolean),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
