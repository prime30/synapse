-- EPIC E: Custom OpenAI-compatible providers
-- Stores user-configured provider endpoints (DeepSeek, Groq, local Ollama, etc.)

CREATE TABLE IF NOT EXISTS custom_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  display_name text not null,
  base_url text not null,
  api_key_enc text not null,
  default_model text not null,
  is_enabled boolean not null default true,
  health_status text not null default 'unknown'
    check (health_status in ('healthy', 'degraded', 'down', 'unknown')),
  last_health_check timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_providers_user ON custom_providers(user_id);

ALTER TABLE custom_providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_providers'
      AND policyname = 'custom_providers_select'
  ) THEN
    CREATE POLICY custom_providers_select
      ON custom_providers
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_providers'
      AND policyname = 'custom_providers_insert'
  ) THEN
    CREATE POLICY custom_providers_insert
      ON custom_providers
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_providers'
      AND policyname = 'custom_providers_update'
  ) THEN
    CREATE POLICY custom_providers_update
      ON custom_providers
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_providers'
      AND policyname = 'custom_providers_delete'
  ) THEN
    CREATE POLICY custom_providers_delete
      ON custom_providers
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;
