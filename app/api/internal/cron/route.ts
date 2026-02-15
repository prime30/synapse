/**
 * Vercel Cron endpoint -- EPIC F
 *
 * Called every 5 minutes by Vercel Cron.
 * Schedules due tasks and dispatches up to 3 per invocation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTaskRunner } from '@/lib/tasks/task-runner';

// Import all built-in tasks so they self-register
import '@/lib/tasks/built-in';

export async function GET(request: NextRequest) {
  // -- Auth check -------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In production, CRON_SECRET must be set
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  // -- Schedule + dispatch ----------------------------------------------------
  const runner = getTaskRunner();
  const results: Array<{ taskName: string; success: boolean; message?: string }> = [];

  try {
    // Schedule any tasks that are due
    const scheduled = await runner.scheduleAllDue();

    // Dispatch up to 3 tasks per invocation (stay within serverless timeout)
    const MAX_DISPATCHES = 3;
    for (let i = 0; i < MAX_DISPATCHES; i++) {
      const dispatched = await runner.dispatchNext();
      if (!dispatched) break;

      results.push({
        taskName: dispatched.taskName,
        success: dispatched.result.success,
        message: dispatched.result.message,
      });
    }

    return NextResponse.json({
      ok: true,
      scheduled,
      dispatched: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
