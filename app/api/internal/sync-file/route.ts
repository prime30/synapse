/**
 * Internal endpoint for the Electron background watcher to push local
 * file changes to Supabase without importing heavy service modules
 * into the main process.
 *
 * POST /api/internal/sync-file
 * Body: { projectId, filePath, content }
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateFile, createFile, listProjectFiles } from '@/lib/services/files';
import { detectFileTypeFromName } from '@/lib/types/files';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { projectId?: string; filePath?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { projectId, filePath, content } = body;
  if (!projectId || !filePath || content === undefined) {
    return NextResponse.json(
      { error: 'projectId, filePath, and content are required' },
      { status: 400 },
    );
  }

  try {
    const files = await listProjectFiles(projectId);
    const existing = files.find((f) => f.path === filePath);

    if (existing) {
      await updateFile(existing.id, { content });
    } else {
      await createFile({
        project_id: projectId,
        name: filePath,
        path: filePath,
        file_type: detectFileTypeFromName(filePath),
        content,
        created_by: 'desktop-sync',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sync-file] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
