/**
 * Internal endpoint to invalidate project files cache.
 * Used by the file-watcher (instrumentation) so it never imports file-loader,
 * avoiding "Can't resolve 'fs'" when that chain is bundled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { invalidateProjectFilesCache } from '@/lib/supabase/file-loader';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body.projectId;
  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  await invalidateProjectFilesCache(projectId);
  return NextResponse.json({ ok: true });
}
