/**
 * Internal endpoint to schedule a Shopify theme push for a project.
 * Used by the file-watcher so it never imports push-queue (which pulls in
 * sync-service and Node's crypto), avoiding client-build resolution errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { schedulePushForProject } from '@/lib/shopify/push-queue';

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

  schedulePushForProject(projectId);
  return NextResponse.json({ ok: true });
}
