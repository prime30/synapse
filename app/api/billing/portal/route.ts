import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { stripe } from '@/lib/billing/stripe';
import { getOrgSubscription } from '@/lib/billing/org-resolver';

// ---------------------------------------------------------------------------
// POST /api/billing/portal
// Creates a Stripe Billing Portal session so the customer can manage their
// subscription, update payment methods, view invoices, etc.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const result = await getOrgSubscription(userId);
    if (!result?.subscription?.stripe_customer_id) {
      throw APIError.notFound(
        'No active subscription found. Subscribe to a plan first.',
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      request.nextUrl.origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: result.subscription.stripe_customer_id,
      return_url: `${origin}/account/billing`,
    });

    return successResponse({ url: session.url });
  } catch (error) {
    return handleAPIError(error);
  }
}
