import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set');
}

let stripe: Stripe;
try {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
    typescript: true,
  });
} catch (err) {
  // Create a placeholder that will fail on actual API calls but not on import
  stripe = null as unknown as Stripe;
}

export { stripe };

// ---------------------------------------------------------------------------
// Plan configuration
// ---------------------------------------------------------------------------

export const PLAN_CONFIG = {
  starter: {
    name: 'Starter',
    includedRequests: 50,
    maxSeats: 1,
    priceMonthly: 0,
    priceAnnual: 0,
  },
  pro: {
    name: 'Pro',
    includedRequests: 500,
    maxSeats: 1,
    priceMonthly: 4900,
    priceAnnual: 47040,
  },
  team: {
    name: 'Team',
    includedRequests: 2000,
    maxSeats: 5,
    priceMonthly: 14900,
    priceAnnual: 143040,
  },
  agency: {
    name: 'Agency',
    includedRequests: 6000,
    maxSeats: 999,
    priceMonthly: 34900,
    priceAnnual: 335040,
  },
} as const;

export type PlanId = keyof typeof PLAN_CONFIG;

// ---------------------------------------------------------------------------
// Price ID resolver
// ---------------------------------------------------------------------------

/**
 * Returns the Stripe Price ID for a given plan + billing interval.
 *
 * Looks for env vars like STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL.
 * Falls back to a placeholder so development doesn't break when the vars
 * aren't configured yet.
 *
 * TODO: Replace placeholders with real Stripe Price IDs once they're created
 * in the Stripe Dashboard.
 */
export function getStripePriceId(
  plan: PlanId,
  annual: boolean,
): string {
  const interval = annual ? 'ANNUAL' : 'MONTHLY';
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${interval}`;
  const envValue = process.env[envKey];

  if (envValue) return envValue;

  throw new Error(
    `Missing Stripe price env var: ${envKey}. ` +
    `Create the price in the Stripe Dashboard and set ${envKey} in your environment.`,
  );
}

/**
 * Returns the Stripe Price ID for overage metered usage.
 * Create in Stripe Dashboard: Products → Overage Usage → Usage-based, $0.01/unit.
 */
export function getStripeOveragePriceId(): string | null {
  return process.env.STRIPE_PRICE_OVERAGE_METERED?.trim() || null;
}
