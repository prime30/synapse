import { getOrgSubscription } from './org-resolver';
import { getKey } from './api-key-vault';
import { PLAN_CONFIG, type PlanId } from './stripe';
import { createServiceClient } from '@/lib/supabase/admin';

export interface UsageCheckResult {
  allowed: boolean;
  isIncluded: boolean;
  currentCount: number;
  organizationId: string;
  plan: string;
  isByok: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Fail-open default — used when any step errors out so agent requests are
// never broken by billing infrastructure issues.
// ---------------------------------------------------------------------------
function failOpen(orgId = '', plan = 'starter'): UsageCheckResult {
  return {
    allowed: true,
    isIncluded: true,
    currentCount: 0,
    organizationId: orgId,
    plan,
    isByok: false,
  };
}

/**
 * Check if the user is allowed to make an agent request.
 * This is the main entry point for plan-based rate limiting.
 *
 * Returns `{ allowed: true }` if the request can proceed,
 * or `{ allowed: false, reason }` if it should be blocked with a 402.
 *
 * **IMPORTANT:** This function NEVER throws. All errors result in fail-open
 * (allow the request) so billing issues never break the product.
 */
export async function checkUsageAllowance(
  userId: string,
): Promise<UsageCheckResult> {
  try {
    // 1. Resolve org + subscription in one call
    const orgSub = await getOrgSubscription(userId);

    if (!orgSub) {
      // No org membership → Starter defaults, allow
      return failOpen();
    }

    const { organizationId: orgId, subscription } = orgSub;
    const plan = (subscription?.plan as PlanId) ?? 'starter';
    const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.starter;
    const includedRequests =
      subscription?.included_requests ?? planConfig.includedRequests;
    const onDemandEnabled = subscription?.on_demand_enabled ?? false;
    const onDemandLimitCents = subscription?.on_demand_limit_cents ?? null;
    const periodStart =
      subscription?.current_period_start ??
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

    // 2. BYOK bypass — if the org has any valid BYOK key and billing_mode
    //    is 'byok', they bypass request-count limits entirely.
    if (subscription?.billing_mode === 'byok') {
      const hasByokKey = await Promise.any([
        getKey(orgId, 'anthropic').then((k) => !!k),
        getKey(orgId, 'openai').then((k) => !!k),
        getKey(orgId, 'google').then((k) => !!k),
      ]).catch(() => false);

      if (hasByokKey) {
        return {
          allowed: true,
          isIncluded: true,
          currentCount: 0,
          organizationId: orgId,
          plan,
          isByok: true,
        };
      }
    }

    // 3. Atomic usage check via the Postgres RPC
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('check_usage_and_reserve', {
      p_org_id: orgId,
      p_period_start: periodStart,
      p_included: includedRequests,
      p_on_demand: onDemandEnabled,
      p_limit_cents: onDemandLimitCents,
    });

    if (error || !data || !data[0]) {
      // RPC failure → fail-open
      console.error('[UsageGuard] RPC error:', error);
      return failOpen(orgId, plan);
    }

    const result = data[0];

    if (!result.allowed) {
      let reason = `You've used all ${includedRequests} included requests this month.`;
      if (onDemandEnabled) {
        reason =
          "You've reached your spending limit. Increase your limit to continue.";
      }
      return {
        allowed: false,
        isIncluded: result.is_included,
        currentCount: result.current_count,
        organizationId: orgId,
        plan,
        isByok: false,
        reason,
      };
    }

    return {
      allowed: true,
      isIncluded: result.is_included,
      currentCount: result.current_count,
      organizationId: orgId,
      plan,
      isByok: false,
    };
  } catch (err) {
    // Belt-and-suspenders: never let the guard crash a request
    console.error('[UsageGuard] unexpected error:', err);
    return failOpen();
  }
}
