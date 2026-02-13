import { createServiceClient } from '@/lib/supabase/admin';

interface PlanFeatures {
  maxProjects: number;
  canUsePreview: boolean;
  canUseCollaboration: boolean;
  canPublish: boolean;
  maxSeats: number;
}

const PLAN_FEATURES: Record<string, Omit<PlanFeatures, 'maxSeats'>> = {
  starter: {
    maxProjects: 1,
    canUsePreview: false,
    canUseCollaboration: false,
    canPublish: false,
  },
  pro: {
    maxProjects: Infinity,
    canUsePreview: true,
    canUseCollaboration: false,
    canPublish: true,
  },
  team: {
    maxProjects: Infinity,
    canUsePreview: true,
    canUseCollaboration: true,
    canPublish: true,
  },
  agency: {
    maxProjects: Infinity,
    canUsePreview: true,
    canUseCollaboration: true,
    canPublish: true,
  },
};

async function getOrgPlan(
  orgId: string,
): Promise<{ plan: string; maxSeats: number }> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, max_seats')
    .eq('organization_id', orgId)
    .single();
  return { plan: data?.plan ?? 'starter', maxSeats: data?.max_seats ?? 1 };
}

export async function canCreateProject(orgId: string): Promise<boolean> {
  const { plan } = await getOrgPlan(orgId);
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter;
  if (features.maxProjects === Infinity) return true;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  return (count ?? 0) < features.maxProjects;
}

export async function canUsePreview(orgId: string): Promise<boolean> {
  const { plan } = await getOrgPlan(orgId);
  return (PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter).canUsePreview;
}

export async function canUseCollaboration(orgId: string): Promise<boolean> {
  const { plan } = await getOrgPlan(orgId);
  return (PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter).canUseCollaboration;
}

export async function canPublish(orgId: string): Promise<boolean> {
  const { plan } = await getOrgPlan(orgId);
  return (PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter).canPublish;
}

export async function getMaxSeats(orgId: string): Promise<number> {
  const { maxSeats } = await getOrgPlan(orgId);
  return maxSeats;
}

export async function getPlanFeatures(orgId: string): Promise<PlanFeatures> {
  const { plan, maxSeats } = await getOrgPlan(orgId);
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter;
  return { ...features, maxSeats };
}
