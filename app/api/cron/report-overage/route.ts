import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { reportOverageToStripe } from '@/lib/billing/overage-reporter';

/**
 * Daily cron: report overage usage to Stripe.
 * Run at 00:05 UTC (or similar) to report for the previous calendar day.
 * Auth: Authorization: Bearer CRON_SECRET (sent by Vercel Cron or in-process scheduler on Fly.io).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Report for the previous calendar day (UTC)
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const dayStr = yesterday.toISOString().slice(0, 10);
  const dayStart = new Date(yesterday).toISOString();
  const dayEnd = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate() + 1)).toISOString();
  const timestampSec = Math.floor(yesterday.getTime() / 1000);

  // Overage per org: is_included=false, is_byok=false, created_at in [dayStart, dayEnd)
  const { data: records } = await supabase
    .from('usage_records')
    .select('organization_id, cost_cents')
    .eq('is_included', false)
    .eq('is_byok', false)
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd);

  if (!records?.length) {
    return NextResponse.json({ reported: 0, day: dayStr });
  }

  const byOrg = new Map<string, number>();
  for (const r of records) {
    byOrg.set(
      r.organization_id,
      (byOrg.get(r.organization_id) ?? 0) + (r.cost_cents ?? 0),
    );
  }

  let reported = 0;
  for (const [orgId, costCents] of byOrg) {
    if (costCents <= 0) continue;

    const { error: insertErr } = await supabase
      .from('processed_overage_reports')
      .insert({ org_id: orgId, day: dayStr });

    if (insertErr) {
      if (insertErr.code === '23505') continue; // unique violation
      console.error('[cron/report-overage] insert failed:', insertErr.message);
      continue;
    }

    await reportOverageToStripe(orgId, costCents, timestampSec);
    reported++;
  }

  return NextResponse.json({ reported, day: dayStr });
}
