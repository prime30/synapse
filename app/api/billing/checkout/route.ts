import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { stripe, PLAN_CONFIG, getStripePriceId, type PlanId } from '@/lib/billing/stripe';
import { getOrganizationId } from '@/lib/billing/org-resolver';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'team', 'agency']),
  annual: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// POST /api/billing/checkout
// Creates a Stripe Checkout Session for the selected plan.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await validateBody(checkoutSchema)(request);

    const plan = body.plan as PlanId;
    const planConfig = PLAN_CONFIG[plan];

    if (!planConfig || plan === 'starter') {
      throw APIError.badRequest(
        'The Starter plan is free — no checkout required.',
        'STARTER_NO_CHECKOUT',
      );
    }

    // Resolve org
    const organizationId = await getOrganizationId(userId);
    if (!organizationId) {
      throw APIError.badRequest(
        'You must belong to an organization before subscribing.',
        'NO_ORGANIZATION',
      );
    }

    // Resolve Stripe price ID
    const priceId = getStripePriceId(plan, body.annual);

    // Build URLs
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      request.nextUrl.origin;
    const successUrl = `${origin}/account/billing?checkout=success`;
    const cancelUrl = `${origin}/account/billing?checkout=cancelled`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        organization_id: organizationId,
        plan,
        annual: body.annual ? 'true' : 'false',
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan,
        },
      },
    });

    return successResponse({ url: session.url });
  } catch (error) {
    return handleAPIError(error);
  }
}
