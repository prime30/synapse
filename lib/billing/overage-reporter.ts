import { stripe } from '@/lib/billing/stripe';
import { createServiceClient } from '@/lib/supabase/admin';

const OVERAGE_MARKUP_MULTIPLIER = Math.max(
  1,
  parseFloat(process.env.OVERAGE_MARKUP_MULTIPLIER ?? '2') || 2,
);

/**
 * Report overage usage to Stripe with markup.
 * Charge = ceil(costCents * OVERAGE_MARKUP_MULTIPLIER).
 * Fire-and-forget: never throws to caller.
 */
export async function reportOverageToStripe(
  orgId: string,
  costCents: number,
  timestamp?: number,
): Promise<void> {
  try {
    if (costCents <= 0) return;

    const chargeCents = Math.ceil(costCents * OVERAGE_MARKUP_MULTIPLIER);

    const supabase = createServiceClient();
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_overage_item_id, billing_mode, status')
      .eq('organization_id', orgId)
      .in('status', ['active', 'past_due', 'trialing'])
      .single();

    if (!sub?.stripe_overage_item_id) {
      return;
    }

    if (sub.billing_mode === 'byok') {
      return;
    }

    await stripe.subscriptionItems.createUsageRecord(sub.stripe_overage_item_id, {
      quantity: chargeCents,
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
      action: 'increment',
    });
  } catch (err) {
    console.error('[overage-reporter] Failed to report for org', orgId, err);
  }
}
