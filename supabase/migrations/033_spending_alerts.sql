-- Spending alerts configuration per organization
CREATE TABLE IF NOT EXISTS public.spending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  monthly_limit_cents INTEGER,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.spending_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can manage spending alerts"
  ON public.spending_alerts FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'
  ));
