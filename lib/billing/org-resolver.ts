import { createServiceClient } from '@/lib/supabase/admin';

/**
 * Look up the primary organization for a user.
 *
 * Returns the first `organization_id` found in `organization_members` for the
 * given user, or `null` when the user has no org membership.
 */
export async function getOrganizationId(
  userId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  return data?.organization_id ?? null;
}

/**
 * Convenience wrapper: resolves the org **and** its current subscription
 * (if any) in one call.
 */
export async function getOrgSubscription(userId: string) {
  const supabase = createServiceClient();

  // 1. Org membership
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (!member?.organization_id) return null;

  // 2. Active subscription for that org
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('organization_id', member.organization_id)
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(1)
    .single();

  return {
    organizationId: member.organization_id,
    subscription: subscription ?? null,
  };
}
