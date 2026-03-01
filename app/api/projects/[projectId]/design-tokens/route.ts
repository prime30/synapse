import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listByProject, type DesignTokenRow } from '@/lib/design-tokens/models/token-model';
import { listProjectFiles, getFile } from '@/lib/services/files';
import { invalidateStyleProfileCache } from '@/lib/ai/style-profile-builder';
import { isTokensStale, clearTokensStale } from '@/lib/design-tokens/stale-detection';
import { getDriftEvents } from '@/lib/design-tokens/drift-events';
import { wcagContrast } from 'culori';

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
  const animation: string[] = [];
  const breakpoints: string[] = [];
  const layout: string[] = [];
  const zindex: string[] = [];
  const a11y: string[] = [];

  for (const row of rows) {
    const val = row.value;
    switch (row.category) {
      case 'color':
        colors.push(val);
        break;
      case 'typography': {
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
      case 'animation':
        animation.push(val);
        break;
      case 'breakpoint':
        breakpoints.push(val);
        break;
      case 'layout':
        layout.push(val);
        break;
      case 'zindex':
        zindex.push(val);
        break;
      case 'a11y':
        a11y.push(val);
        break;
    }
  }

  return {
    colors: [...new Set(colors)],
    fonts: [...new Set(fonts)],
    fontSizes: [...new Set(fontSizes)],
    spacing: [...new Set(spacing)],
    radii: [...new Set(radii)],
    shadows: [...new Set(shadows)],
    animation: [...new Set(animation)],
    breakpoints: [...new Set(breakpoints)],
    layout: [...new Set(layout)],
    zindex: [...new Set(zindex)],
    a11y: [...new Set(a11y)],
  };
}

/** Build ramp data from tokens with metadata.ramp=true. */
function buildRampsFromRows(rows: DesignTokenRow[]): Record<string, Array<{ step: number; hex: string; contrastOnWhite: number; contrastOnBlack: number }>> {
  const rampRows = rows.filter(
    (r) => r.category === 'color' && r.metadata?.ramp === true && typeof r.metadata?.step === 'number',
  );
  if (rampRows.length === 0) return {};

  const byParent = new Map<string, DesignTokenRow[]>();
  for (const r of rampRows) {
    const parent = (r.metadata?.parentColor as string) ?? r.name.replace(/-\d+$/, '');
    const list = byParent.get(parent) ?? [];
    list.push(r);
    byParent.set(parent, list);
  }

  const ramps: Record<string, Array<{ step: number; hex: string; contrastOnWhite: number; contrastOnBlack: number }>> = {};
  const white = '#ffffff';
  const black = '#000000';

  for (const [parent, list] of byParent) {
    const entries = list
      .sort((a, b) => (a.metadata?.step as number) - (b.metadata?.step as number))
      .map((r) => ({
        step: r.metadata?.step as number,
        hex: r.value,
        contrastOnWhite: wcagContrast(r.value, white) ?? 0,
        contrastOnBlack: wcagContrast(r.value, black) ?? 0,
      }));
    ramps[parent] = entries;
  }
  return ramps;
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
const EMPTY_TOKEN_RESPONSE = {
  tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [], animation: [], breakpoints: [], layout: [], zindex: [], a11y: [] },
  tokenCount: 0,
  fileCount: 0,
  analyzedFiles: [],
};

function isTableMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as Record<string, unknown>)?.code as string | undefined;
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('design_tokens') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const [rows, files] = await Promise.all([
      listByProject(projectId),
      listProjectFiles(projectId),
    ]);
    const tokens = aggregateTokens(rows);
    const ramps = buildRampsFromRows(rows);
    const stale = await isTokensStale(projectId);
    const driftEvents = getDriftEvents(projectId, 3);

    return successResponse({
      tokens,
      ramps,
      tokenCount: rows.length,
      fileCount: files?.length ?? 0,
      analyzedFiles: [],
      stale,
      driftEvents,
    });
  } catch (error) {
    if (isTableMissingError(error)) {
      return successResponse(EMPTY_TOKEN_RESPONSE);
    }
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
        tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [], animation: [], breakpoints: [], layout: [], zindex: [], a11y: [] },
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
        tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [], animation: [], breakpoints: [], layout: [], zindex: [], a11y: [] },
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
    const ramps = buildRampsFromRows(rows);

    invalidateStyleProfileCache(projectId);
    clearTokensStale(projectId);

    return successResponse({
      tokens,
      ramps,
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
