import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceClient();

    const { data: membership } = await serviceClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const orgId = membership.organization_id as string;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [usageResult, dailyResult, projectResult] = await Promise.all([
      serviceClient
        .from('usage_records')
        .select('model, cost_cents, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, request_type, is_included')
        .eq('organization_id', orgId)
        .gte('created_at', periodStart),

      serviceClient
        .from('usage_records')
        .select('created_at, cost_cents, input_tokens, output_tokens, cache_read_input_tokens')
        .eq('organization_id', orgId)
        .gte('created_at', thirtyDaysAgo),

      serviceClient
        .from('usage_records')
        .select('project_id, cost_cents')
        .eq('organization_id', orgId)
        .gte('created_at', periodStart),
    ]);

    const records = usageResult.data ?? [];
    const dailyRecords = dailyResult.data ?? [];
    const projectRecords = projectResult.data ?? [];

    const totalRequests = records.length;
    const totalCostCents = records.reduce((sum, r) => sum + ((r.cost_cents as number) ?? 0), 0);
    const includedRequests = records.filter(r => r.is_included).length;
    const totalInputTokens = records.reduce((sum, r) => sum + ((r.input_tokens as number) ?? 0), 0);
    const totalOutputTokens = records.reduce((sum, r) => sum + ((r.output_tokens as number) ?? 0), 0);
    const totalCacheReadTokens = records.reduce((sum, r) => sum + ((r.cache_read_input_tokens as number) ?? 0), 0);
    const totalCacheCreationTokens = records.reduce((sum, r) => sum + ((r.cache_creation_input_tokens as number) ?? 0), 0);
    const cacheHitRate = totalInputTokens > 0
      ? Math.round((totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)) * 100)
      : 0;

    const byModel: Record<string, { requests: number; costCents: number; inputTokens: number; outputTokens: number }> = {};
    for (const r of records) {
      const m = (r.model as string) ?? 'unknown';
      if (!byModel[m]) byModel[m] = { requests: 0, costCents: 0, inputTokens: 0, outputTokens: 0 };
      byModel[m].requests++;
      byModel[m].costCents += (r.cost_cents as number) ?? 0;
      byModel[m].inputTokens += (r.input_tokens as number) ?? 0;
      byModel[m].outputTokens += (r.output_tokens as number) ?? 0;
    }

    const dailyMap: Record<string, { requests: number; costCents: number; inputTokens: number; outputTokens: number; cacheReadTokens: number }> = {};
    for (const r of dailyRecords) {
      const day = (r.created_at as string).slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { requests: 0, costCents: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
      dailyMap[day].requests++;
      dailyMap[day].costCents += (r.cost_cents as number) ?? 0;
      dailyMap[day].inputTokens += (r.input_tokens as number) ?? 0;
      dailyMap[day].outputTokens += (r.output_tokens as number) ?? 0;
      dailyMap[day].cacheReadTokens += (r.cache_read_input_tokens as number) ?? 0;
    }
    const daily = Object.entries(dailyMap)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const projectMap: Record<string, number> = {};
    for (const r of projectRecords) {
      const pid = (r.project_id as string) ?? 'unknown';
      projectMap[pid] = (projectMap[pid] ?? 0) + ((r.cost_cents as number) ?? 0);
    }
    const topProjects = Object.entries(projectMap)
      .map(([projectId, costCents]) => ({ projectId, costCents }))
      .sort((a, b) => b.costCents - a.costCents)
      .slice(0, 10);

    return NextResponse.json({
      periodStart,
      totalRequests,
      includedRequests,
      totalCostCents,
      totalCostDollars: (totalCostCents / 100).toFixed(2),
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      cacheHitRate,
      byModel,
      daily,
      topProjects,
    });
  } catch (err) {
    console.error('[Usage API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
