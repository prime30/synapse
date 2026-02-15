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
        onDemandLimitCents: null,
        overageCostCents: 0,
        overageChargeCents: 0,
        usageBreakdown: [],
        priceMonthly: 0,
      });
    }

    const sub = result.subscription;
    const plan = (sub.plan ?? 'starter') as PlanId;
    const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.starter;

    // Count usage records in the current billing period
    const periodStart: string | null = sub.current_period_start ?? null;
    const periodEnd: string | null = sub.current_period_end ?? null;

    let usedRequests = 0;
    let overageCostCents = 0;
    const usageBreakdown: { model: string; requests: number; tokens: number; cost: number }[] = [];

    if (periodStart) {
      const supabase = createServiceClient();

      let countQuery = supabase
        .from('usage_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', result.organizationId)
        .eq('is_byok', false)
        .gte('created_at', periodStart);

      if (periodEnd) {
        countQuery = countQuery.lte('created_at', periodEnd);
      }

      const { count } = await countQuery;
      usedRequests = count ?? 0;

      let recordsQuery = supabase
        .from('usage_records')
        .select('model, input_tokens, output_tokens, cost_cents, is_included, created_at')
        .eq('organization_id', result.organizationId)
        .eq('is_byok', false)
        .gte('created_at', periodStart);

      if (periodEnd) {
        recordsQuery = recordsQuery.lte('created_at', periodEnd);
      }

      const { data: records } = await recordsQuery;

      if (records) {
        const byModel = new Map<
          string,
          { requests: number; tokens: number; cost: number }
        >();
        for (const r of records) {
          const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
          const cost = (r.cost_cents ?? 0) / 100;
          if (!r.is_included) overageCostCents += r.cost_cents ?? 0;
          const key = r.model ?? 'unknown';
          const prev = byModel.get(key) ?? {
            requests: 0,
            tokens: 0,
            cost: 0,
          };
          byModel.set(key, {
            requests: prev.requests + 1,
            tokens: prev.tokens + tokens,
            cost: prev.cost + cost,
          });
        }
        for (const [model, data] of byModel) {
          usageBreakdown.push({ model, ...data });
        }
      }
    }

    const markup =
      Math.max(1, parseFloat(process.env.OVERAGE_MARKUP_MULTIPLIER ?? '2') || 2);
    const overageChargeCents = Math.ceil(overageCostCents * markup);

    return successResponse({
      plan,
      status: sub.status ?? 'active',
      includedRequests: sub.included_requests ?? planConfig.includedRequests,
      usedRequests,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      onDemandEnabled: sub.on_demand_enabled ?? false,
      onDemandLimitCents: sub.on_demand_limit_cents ?? null,
      overageCostCents,
      overageChargeCents,
      usageBreakdown,
      priceMonthly: (planConfig.priceMonthly ?? 0) / 100,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
