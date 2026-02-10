import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { detectFileTypeFromName } from '@/lib/types/files';

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

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp4', 'webm', 'mp3',
]);

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for file uploads');
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
}

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

  // Only accept files inside recognised theme directories
  if (!THEME_DIRS.has(segments[0])) return null;

  return path;
}

/**
 * POST /api/projects/[projectId]/files/upload
 *
 * Accepts a multipart FormData with a `file` field containing a .zip.
 * Extracts the ZIP, normalizes Shopify theme paths, and creates files
 * in the project using the service role client (bypasses RLS).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);
    const supabase = getAdminClient();

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
    await supabase.from('files').delete().eq('project_id', projectId);

    // ── Create files directly via service role client ────────────────────
    let imported = 0;
    const errors: string[] = [];

    // Process in batches of 20
    const BATCH = 20;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);

      // Read all file contents in parallel
      const rows = await Promise.all(
        batch.map(async ({ path, zipEntry }) => {
          try {
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            const content = BINARY_EXTS.has(ext)
              ? await zipEntry.async('base64')
              : await zipEntry.async('string');

            const sizeBytes = new TextEncoder().encode(content).length;

            return {
              project_id: projectId,
              name: path,
              path,
              file_type: detectFileTypeFromName(path),
              size_bytes: sizeBytes,
              content,
              storage_path: null,
              created_by: userId,
            };
          } catch (err) {
            errors.push(
              `${path}: ${err instanceof Error ? err.message : 'read error'}`
            );
            return null;
          }
        })
      );

      // Filter out nulls (read failures) and insert in one batch
      const validRows = rows.filter(Boolean);
      if (validRows.length > 0) {
        const { error: insertError, data } = await supabase
          .from('files')
          .insert(validRows)
          .select('id');

        if (insertError) {
          errors.push(`Batch insert error: ${insertError.message}`);
        } else {
          imported += data?.length ?? 0;
        }
      }
    }

    // ── Post-upload: run design system ingestion in background ──────────
    // Extract tokens and detect components from the uploaded theme files.
    // This is non-blocking — we return the upload result immediately.
    // The ingestion writes to design_tokens and design_components tables.
    const ingestionFiles: { id: string; path: string; content: string }[] = [];
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      for (const { path, zipEntry } of batch) {
        const ext = path.split('.').pop()?.toLowerCase() ?? '';
        if (BINARY_EXTS.has(ext)) continue; // skip binary files
        try {
          const content = await zipEntry.async('string');
          ingestionFiles.push({ id: path, path, content });
        } catch {
          // skip unreadable files
        }
      }
    }

    // Fire-and-forget ingestion (don't await — let it run in the background)
    if (ingestionFiles.length > 0) {
      import('@/lib/design-tokens/components/theme-ingestion')
        .then(({ ingestTheme }) => ingestTheme(projectId, ingestionFiles))
        .then((result) => {
          console.log(
            `[Theme Ingestion] Project ${projectId}: ${result.tokensCreated} tokens created, ` +
            `${result.componentsDetected} components detected from ${result.totalFilesAnalyzed} files.`,
          );
        })
        .catch((err) => {
          console.warn('[Theme Ingestion] Failed:', err);
        });
    }

    return successResponse({
      imported,
      errors: errors.slice(0, 10),
      total: entries.length,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
