import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getOrgSubscriptionAsOwner } from '@/lib/billing/org-resolver';
import { createServiceClient } from '@/lib/supabase/admin';

const onDemandSchema = z.object({
  enabled: z.boolean(),
  limitCents: z.number().int().min(0).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await validateBody(onDemandSchema)(request);

    const result = await getOrgSubscriptionAsOwner(userId);
    if (!result?.subscription) {
      throw APIError.forbidden(
        'Only organization owners can update on-demand settings.',
      );
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('subscriptions')
      .update({
        on_demand_enabled: body.enabled,
        on_demand_limit_cents: body.limitCents ?? null,
      })
      .eq('organization_id', result.organizationId);

    if (error) {
      throw APIError.internal('Failed to update on-demand settings.');
    }

    return successResponse({
      onDemandEnabled: body.enabled,
      onDemandLimitCents: body.limitCents ?? null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
