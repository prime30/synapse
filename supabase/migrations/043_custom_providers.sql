-- EPIC E: Custom OpenAI-compatible providers
-- Stores user-configured provider endpoints (DeepSeek, Groq, local Ollama, etc.)

create table if not exists custom_providers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  display_name text not null,
  base_url     text not null,
  api_key_enc  text not null,  -- encrypted at rest by Supabase vault
  default_model text not null,
  is_enabled   boolean not null default true,
  health_status text not null default 'unknown' check (health_status in ('healthy', 'degraded', 'down', 'unknown')),
  last_health_check timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, name)
);

-- Index for lookup by user
create index if not exists idx_custom_providers_user on custom_providers(user_id);

-- RLS
alter table custom_providers enable row level security;

-- Users can only see/manage their own providers
create policy custom_providers_select on custom_providers for select using (auth.uid() = user_id);
create policy custom_providers_insert on custom_providers for insert with check (auth.uid() = user_id);
create policy custom_providers_update on custom_providers for update using (auth.uid() = user_id);
create policy custom_providers_delete on custom_providers for delete using (auth.uid() = user_id);