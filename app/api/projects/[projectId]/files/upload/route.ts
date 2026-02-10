import { NextRequest } from 'next/server';
import JSZip from 'jszip';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createFile } from '@/lib/services/files';
import { detectFileTypeFromName } from '@/lib/types/files';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Shopify theme directories we recognize
const THEME_DIRS = new Set([
  'assets',
  'config',
  'layout',
  'locales',
  'sections',
  'snippets',
  'templates',
  'blocks',
]);

const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 500;

/**
 * Determine whether a ZIP entry is a valid theme file we should import.
 * Returns the normalized path (with theme root prefix stripped) or null to skip.
 */
function normalizeThemePath(rawPath: string): string | null {
  // Skip directories, macOS resource forks, hidden files
  if (rawPath.endsWith('/')) return null;
  if (rawPath.includes('__MACOSX')) return null;
  if (rawPath.split('/').some((seg) => seg.startsWith('.'))) return null;

  const segments = rawPath.split('/');

  // Many exported ZIPs have a single root folder (e.g. "Dawn-main/assets/…").
  // Detect and strip it so paths start with the theme directory.
  if (segments.length >= 2 && !THEME_DIRS.has(segments[0]) && THEME_DIRS.has(segments[1])) {
    segments.shift(); // strip root folder
  }

  const path = segments.join('/');
  if (!path) return null;

  return path;
}

/**
 * POST /api/projects/[projectId]/files/upload
 *
 * Accepts a multipart FormData with a `file` field containing a .zip.
 * Extracts the ZIP, normalizes Shopify theme paths, and creates files
 * in the project.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    // ── Parse FormData ──────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      throw APIError.badRequest('A file field with a .zip file is required');
    }

    if (file.size > MAX_ZIP_SIZE) {
      throw APIError.badRequest('ZIP file exceeds 50 MB limit');
    }

    // ── Read & extract ZIP ──────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw APIError.badRequest('Could not read the file — is it a valid .zip?');
    }

    // ── Collect valid entries ────────────────────────────────────────────
    const entries: { path: string; zipEntry: JSZip.JSZipObject }[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const normalized = normalizeThemePath(relativePath);
      if (normalized) {
        entries.push({ path: normalized, zipEntry });
      }
    });

    if (entries.length === 0) {
      throw APIError.badRequest(
        'No theme files found in the ZIP. Expected directories: assets/, config/, layout/, locales/, sections/, snippets/, templates/'
      );
    }

    if (entries.length > MAX_FILES) {
      throw APIError.badRequest(`ZIP contains ${entries.length} files — maximum is ${MAX_FILES}`);
    }

    // ── Delete existing files for a clean import ────────────────────────
    const supabase = await createClient();
    await supabase.from('files').delete().eq('project_id', projectId);

    // ── Create files ────────────────────────────────────────────────────
    let imported = 0;
    const errors: string[] = [];

    // Process in batches of 20 to avoid overwhelming the DB
    const BATCH = 20;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async ({ path, zipEntry }) => {
          try {
            // Read file content as text; binary files get base64
            let content: string;
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            const binaryExts = new Set([
              'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg',
              'woff', 'woff2', 'ttf', 'eot', 'otf',
              'mp4', 'webm', 'mp3',
            ]);

            if (binaryExts.has(ext)) {
              // Store binary as base64
              content = await zipEntry.async('base64');
            } else {
              content = await zipEntry.async('string');
            }

            // Use filename as the display name (last segment)
            const name = path.split('/').pop()!;

            await createFile({
              project_id: projectId,
              name: path, // use full path as name for uniqueness
              path,
              file_type: detectFileTypeFromName(name),
              content,
              created_by: userId,
            });

            imported++;
          } catch (err) {
            errors.push(
              `${path}: ${err instanceof Error ? err.message : 'unknown error'}`
            );
          }
        })
      );
    }

    return successResponse({
      imported,
      errors: errors.slice(0, 10), // Cap error list
      total: entries.length,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
