import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listProjectFiles, getFile } from '@/lib/services/files';
import {
  extractTokens,
  mergeTokens,
  type TokenFileType,
  type DesignTokens,
} from '@/lib/design-tokens';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/** Map file extension / path to a TokenFileType. Returns null if not extractable. */
function classifyFile(name: string, path: string): TokenFileType | null {
  const lower = (path || name).toLowerCase();
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css';
  if (lower.endsWith('.liquid')) return 'liquid';
  if (
    lower.endsWith('.json') &&
    (lower.includes('settings_schema') ||
      lower.includes('settings_data') ||
      lower.startsWith('config/'))
  ) {
    return 'json';
  }
  return null;
}

/**
 * GET /api/projects/[projectId]/design-tokens
 *
 * Scans project files and extracts design tokens (colors, fonts, spacing, etc.).
 * Returns a merged, deduplicated set of tokens found across all theme files.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    // List all project files
    const files = await listProjectFiles(projectId);
    if (!files || files.length === 0) {
      return successResponse({
        tokens: {
          colors: [],
          fonts: [],
          fontSizes: [],
          spacing: [],
          radii: [],
          shadows: [],
        } satisfies DesignTokens,
        fileCount: 0,
        analyzedFiles: [],
      });
    }

    // Filter to extractable files
    const extractable = files
      .map((f) => ({
        id: f.id as string,
        name: f.name as string,
        path: (f.path ?? f.name) as string,
        fileType: classifyFile(f.name as string, (f.path ?? f.name) as string),
      }))
      .filter((f) => f.fileType !== null);

    // Read content and extract tokens from each file
    const tokenSets: DesignTokens[] = [];
    const analyzedFiles: string[] = [];

    for (const file of extractable) {
      try {
        const fullFile = await getFile(file.id);
        const content = fullFile?.content;
        if (typeof content === 'string' && content.length > 0) {
          const tokens = extractTokens(content, file.fileType!);
          tokenSets.push(tokens);
          analyzedFiles.push(file.path);
        }
      } catch {
        // Skip files that fail to read (e.g. storage issues)
        continue;
      }
    }

    // Merge and deduplicate
    const merged = tokenSets.length > 0 ? mergeTokens(...tokenSets) : {
      colors: [],
      fonts: [],
      fontSizes: [],
      spacing: [],
      radii: [],
      shadows: [],
    };

    return successResponse({
      tokens: merged,
      fileCount: files.length,
      analyzedFiles,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
