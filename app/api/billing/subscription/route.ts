import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { PLAN_CONFIG, type PlanId } from '@/lib/billing/stripe';
import { getOrgSubscription } from '@/lib/billing/org-resolver';
import { createServiceClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// GET /api/billing/subscription
// Returns the caller's current subscription details + usage for the current
// billing period.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const result = await getOrgSubscription(userId);

    // No subscription → return Starter defaults
    if (!result?.subscription) {
      return successResponse({
        plan: 'starter' as PlanId,
        status: 'active',
        includedRequests: PLAN_CONFIG.starter.includedRequests,
        usedRequests: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        onDemandEnabled: false,
        onDemandLimitCents: 0,
      });
    }

    const sub = result.subscription;
    const plan = (sub.plan ?? 'starter') as PlanId;
    const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.starter;

    // Count usage records in the current billing period
    const periodStart: string | null = sub.current_period_start ?? null;
    const periodEnd: string | null = sub.current_period_end ?? null;

    let usedRequests = 0;

    if (periodStart) {
      const supabase = createServiceClient();
      const query = supabase
        .from('usage_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', result.organizationId)
        .gte('created_at', periodStart);

      if (periodEnd) {
        query.lte('created_at', periodEnd);
      }

      const { count } = await query;
      usedRequests = count ?? 0;
    }

    return successResponse({
      plan,
      status: sub.status ?? 'active',
      includedRequests: sub.included_requests ?? planConfig.includedRequests,
      usedRequests,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      onDemandEnabled: sub.on_demand_enabled ?? false,
      onDemandLimitCents: sub.on_demand_limit_cents ?? 0,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
