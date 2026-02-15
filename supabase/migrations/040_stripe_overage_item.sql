-- Stripe overage metered billing: store subscription item ID for usage reporting
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_overage_item_id TEXT;

-- Idempotency for daily overage cron (Phase 2)
CREATE TABLE IF NOT EXISTS public.processed_overage_reports (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, day)
);
