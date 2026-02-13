import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listByProject, type DesignTokenRow } from '@/lib/design-tokens/models/token-model';
import { listProjectFiles, getFile } from '@/lib/services/files';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Map persisted DesignTokenRow[] into the flat category-based shape
 * that the DesignTokenBrowser / useDesignTokens hook expect.
 */
function aggregateTokens(rows: DesignTokenRow[]) {
  const colors: string[] = [];
  const fonts: string[] = [];
  const fontSizes: string[] = [];
  const spacing: string[] = [];
  const radii: string[] = [];
  const shadows: string[] = [];

  for (const row of rows) {
    const val = row.value;
    switch (row.category) {
      case 'color':
        colors.push(val);
        break;
      case 'typography': {
        // Heuristic: values like "16px", "1.5rem" → fontSizes; rest → fonts
        if (/^\d/.test(val)) fontSizes.push(val);
        else fonts.push(val);
        break;
      }
      case 'spacing':
        spacing.push(val);
        break;
      case 'border':
        radii.push(val);
        break;
      case 'shadow':
        shadows.push(val);
        break;
      // animation — no matching bucket in legacy shape; skip
    }
  }

  return {
    colors: [...new Set(colors)],
    fonts: [...new Set(fonts)],
    fontSizes: [...new Set(fontSizes)],
    spacing: [...new Set(spacing)],
    radii: [...new Set(radii)],
    shadows: [...new Set(shadows)],
  };
}

/* ------------------------------------------------------------------ */
/*  GET  — Read persisted tokens from the database                     */
/* ------------------------------------------------------------------ */

/**
 * GET /api/projects/[projectId]/design-tokens
 *
 * Returns design tokens that were previously extracted and persisted
 * to the design_tokens table (populated automatically on theme import).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const [rows, files] = await Promise.all([
      listByProject(projectId),
      listProjectFiles(projectId),
    ]);
    const tokens = aggregateTokens(rows);

    return successResponse({
      tokens,
      tokenCount: rows.length,
      fileCount: files?.length ?? 0,
      analyzedFiles: [], // historical field; no longer tracked per-request
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Manually trigger a re-scan of all project files             */
/* ------------------------------------------------------------------ */

/**
 * POST /api/projects/[projectId]/design-tokens
 *
 * Re-extracts design tokens from all project files and persists them,
 * replacing any previously stored tokens. Useful when files have
 * changed outside of the normal import flow.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    // 1. Load all project files with content
    const files = await listProjectFiles(projectId);
    if (!files || files.length === 0) {
      return successResponse({
        tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [] },
        tokenCount: 0,
        tokensCreated: 0,
        tokensUpdated: 0,
        componentsDetected: 0,
      });
    }

    const ingestionFiles: { id: string; path: string; content: string }[] = [];
    for (const f of files) {
      try {
        const fullFile = await getFile(f.id as string);
        const content = fullFile?.content;
        if (typeof content === 'string' && content.length > 0) {
          ingestionFiles.push({
            id: f.id as string,
            path: (f.path ?? f.name) as string,
            content,
          });
        }
      } catch {
        // skip unreadable files
      }
    }

    if (ingestionFiles.length === 0) {
      return successResponse({
        tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [] },
        tokenCount: 0,
        tokensCreated: 0,
        tokensUpdated: 0,
        componentsDetected: 0,
      });
    }

    // 2. Run the full ingestion pipeline (extract, infer, persist)
    const { ingestTheme } = await import(
      '@/lib/design-tokens/components/theme-ingestion'
    );
    const result = await ingestTheme(projectId, ingestionFiles);

    // 3. Read back the now-persisted tokens for the response
    const rows = await listByProject(projectId);
    const tokens = aggregateTokens(rows);

    return successResponse({
      tokens,
      tokenCount: rows.length,
      tokensCreated: result.tokensCreated,
      tokensUpdated: result.tokensUpdated,
      componentsDetected: result.componentsDetected,
      totalFilesAnalyzed: result.totalFilesAnalyzed,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
