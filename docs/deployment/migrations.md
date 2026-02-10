# Database migrations

Migrations live in `supabase/migrations/` and are applied in order (by filename).

## Applying migrations

### Local (Supabase CLI)

```bash
npx supabase db push
```

If you see **"Cannot find project ref. Have you run supabase link?"**, either link the project (`npx supabase link`) or apply the migration SQL manually (see below).

Or apply a single file:

```bash
psql $DATABASE_URL -f supabase/migrations/024_theme_push_history.sql
```

### Staging / production

Use your normal process (e.g. Supabase Dashboard → SQL Editor, or CI that runs migrations). Ensure migrations run **before** or **with** the deploy that depends on them.

## After adding a new migration

1. Run it locally and verify the app.
2. Document any new tables or behavior in `docs/internal/` if relevant.
3. In your PR, note the migration in the description so reviewers and deploy pipelines know to run it.

## Recent migrations (reference)

| File | Purpose |
|------|---------|
| `024_theme_push_history.sql` | Theme push history table (rollback, triggers, RLS) for Shopify preview flow |
