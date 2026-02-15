import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, PLAN_CONFIG, getStripeOveragePriceId, type PlanId } from '@/lib/billing/stripe';
import { createServiceClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// POST /api/billing/webhook
//
// Receives Stripe webhook events. NOT authenticated via requireAuth — Stripe
// signs the payload and we verify the signature here.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  // 1. Verify signature ─────────────────────────────────────────────────────
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 },
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 },
      );
    }

    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe-webhook] Signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  // 2. Idempotency check ────────────────────────────────────────────────────
  const supabase = createServiceClient();

  try {
    const { data: existing } = await supabase
      .from('processed_stripe_events')
      .select('id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      // Already processed — return 200 so Stripe doesn't retry
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // If the idempotency table doesn't exist yet, log and continue processing
    console.warn('[stripe-webhook] idempotency check failed:', err);
  }

  // 3. Handle event ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabase);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, supabase);
        break;

      default:
        // Unhandled event type — log for visibility
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await supabase
      .from('processed_stripe_events')
      .insert({ event_id: event.id, event_type: event.type })
      .then(({ error }) => {
        if (error) {
          console.warn('[stripe-webhook] Failed to record processed event:', error.message);
        }
      });
  } catch (err) {
    // Always return 200 to Stripe so it doesn't retry endlessly.
    // Log the error so we can investigate.
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof createServiceClient>;

/**
 * Find the Stripe subscription item ID for the overage metered price.
 * Returns null if not configured or not found on the subscription.
 */
function getOverageItemId(subscription: Stripe.Subscription): string | null {
  const overagePriceId = getStripeOveragePriceId();
  if (!overagePriceId) return null;

  const item = subscription.items.data.find(
    (si) => (typeof si.price === 'string' ? si.price : si.price.id) === overagePriceId,
  );
  return item?.id ?? null;
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseAdmin,
) {
  const organizationId = session.metadata?.organization_id;
  const plan = (session.metadata?.plan ?? 'pro') as PlanId;
  const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.pro;

  if (!organizationId) {
    console.error('[stripe-webhook] checkout.session.completed missing organization_id in metadata');
    return;
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.error('[stripe-webhook] checkout.session.completed missing subscription ID');
    return;
  }

  // Fetch the full subscription + its latest invoice to derive period dates.
  // In Stripe API >=2024-10, `current_period_start/end` moved off Subscription;
  // the canonical source is the latest invoice's `period_start` / `period_end`.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });

  const latestInvoice =
    typeof subscription.latest_invoice === 'object'
      ? subscription.latest_invoice
      : null;

  const periodStart = latestInvoice
    ? new Date(latestInvoice.period_start * 1000).toISOString()
    : new Date(subscription.start_date * 1000).toISOString();
  const periodEnd = latestInvoice
    ? new Date(latestInvoice.period_end * 1000).toISOString()
    : null;

  const stripeOverageItemId = getOverageItemId(subscription);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id:
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null,
        plan,
        status: subscription.status,
        included_requests: planConfig.includedRequests,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        stripe_overage_item_id: stripeOverageItemId,
      },
      { onConflict: 'organization_id' },
    );

  if (error) {
    console.error('[stripe-webhook] Failed to upsert subscription:', error.message);
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdmin,
) {
  const organizationId = subscription.metadata?.organization_id;
  if (!organizationId) {
    console.warn('[stripe-webhook] subscription.updated missing organization_id in metadata');
    return;
  }

  const plan = (subscription.metadata?.plan ?? 'pro') as PlanId;
  const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.pro;

  // Derive period dates from the latest invoice (Stripe API >=2024-10).
  const latestInvoice =
    typeof subscription.latest_invoice === 'object'
      ? subscription.latest_invoice
      : null;

  const periodStart = latestInvoice
    ? new Date(latestInvoice.period_start * 1000).toISOString()
    : new Date(subscription.start_date * 1000).toISOString();
  const periodEnd = latestInvoice
    ? new Date(latestInvoice.period_end * 1000).toISOString()
    : null;

  const stripeOverageItemId = getOverageItemId(subscription);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id:
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id ?? null,
        plan,
        status: subscription.status,
        included_requests: planConfig.includedRequests,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        stripe_overage_item_id: stripeOverageItemId,
      },
      { onConflict: 'organization_id' },
    );

  if (error) {
    console.error('[stripe-webhook] Failed to update subscription:', error.message);
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdmin,
) {
  const stripeSubId = subscription.id;

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('[stripe-webhook] Failed to cancel subscription:', error.message);
  }
}

/**
 * Extract the subscription ID from an invoice.
 * In Stripe API >=2024-10, the subscription ref moved from `invoice.subscription`
 * to `invoice.parent.subscription_details.subscription`.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseAdmin,
) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    console.error('[stripe-webhook] Failed to mark subscription as past_due:', error.message);
  }

  // TODO: Send payment failure notification email to org owner
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  supabase: SupabaseAdmin,
) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  // Only reset to active if the subscription was in past_due state
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('stripe_subscription_id', subscriptionId)
    .eq('status', 'past_due');

  if (error) {
    console.error('[stripe-webhook] Failed to reset subscription to active:', error.message);
  }
}
