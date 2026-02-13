-- Usage records for billing
CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  execution_id UUID,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  is_byok BOOLEAN NOT NULL DEFAULT false,
  is_included BOOLEAN NOT NULL DEFAULT true,
  request_type TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_records_org_created ON public.usage_records(organization_id, created_at);
CREATE INDEX idx_usage_records_user ON public.usage_records(user_id, created_at);

-- Daily rollup for dashboard performance
CREATE TABLE IF NOT EXISTS public.daily_usage_rollups (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  model TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  included_count INTEGER NOT NULL DEFAULT 0,
  overage_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, day, model)
);

-- Stripe webhook idempotency
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic usage check RPC
CREATE OR REPLACE FUNCTION public.check_usage_and_reserve(
  p_org_id UUID,
  p_period_start TIMESTAMPTZ,
  p_included INTEGER,
  p_on_demand BOOLEAN,
  p_limit_cents INTEGER DEFAULT NULL
) RETURNS TABLE(allowed BOOLEAN, is_included BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
  v_cost INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.usage_records
    WHERE organization_id = p_org_id AND created_at >= p_period_start AND NOT is_byok;

  is_included := v_count < p_included;
  current_count := v_count;

  IF v_count < p_included THEN
    allowed := true;
  ELSIF p_on_demand THEN
    SELECT COALESCE(SUM(cost_cents), 0) INTO v_cost FROM public.usage_records
      WHERE organization_id = p_org_id AND created_at >= p_period_start AND NOT usage_records.is_included AND NOT is_byok;
    allowed := p_limit_cents IS NULL OR v_cost < p_limit_cents;
  ELSE
    allowed := false;
  END IF;

  RETURN NEXT;
END $$;

-- Rollup refresh function
CREATE OR REPLACE FUNCTION public.refresh_daily_usage_rollup(p_org_id UUID, p_day DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.daily_usage_rollups (organization_id, day, model, request_count, input_tokens, output_tokens, total_cost_cents, included_count, overage_count)
  SELECT
    organization_id, p_day, model,
    COUNT(*),
    SUM(input_tokens),
    SUM(output_tokens),
    SUM(cost_cents),
    COUNT(*) FILTER (WHERE is_included),
    COUNT(*) FILTER (WHERE NOT is_included)
  FROM public.usage_records
  WHERE organization_id = p_org_id AND created_at::date = p_day
  GROUP BY organization_id, model
  ON CONFLICT (organization_id, day, model) DO UPDATE SET
    request_count = EXCLUDED.request_count,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    total_cost_cents = EXCLUDED.total_cost_cents,
    included_count = EXCLUDED.included_count,
    overage_count = EXCLUDED.overage_count;
END $$;

-- RLS
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- usage_records: SELECT via org membership
CREATE POLICY "Org members can view usage records"
  ON public.usage_records FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- daily_usage_rollups: SELECT via org membership
CREATE POLICY "Org members can view usage rollups"
  ON public.daily_usage_rollups FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- processed_stripe_events: No client access (service role only)
-- No policies needed — defaults to deny all for anon/authenticated
