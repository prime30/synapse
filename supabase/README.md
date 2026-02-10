# Supabase migrations

The app expects these tables (and related RLS/policies) to exist. If you see **"Could not find the table 'public.organizations' in the schema cache"**, the migrations have not been applied to your project yet.

## Apply migrations

### Option 1: Supabase CLI (recommended)

1. Log in (one-time): `npx supabase login`
2. Link your remote project (one-time): `npx supabase link --project-ref YOUR_PROJECT_REF`  
   Get the ref from the Supabase Dashboard URL or project settings (e.g. `qivqgupticekunfhkvwf`).
3. Push all migrations: `npm run db:push`

Or, for a clean local DB: `npx supabase db reset`

### Option 2: SQL Editor (hosted project)

If you can’t use the CLI (e.g. no login yet), use the [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**:

- **Single run:** Open `supabase/run-all-migrations.sql`, copy its full contents, paste into the SQL Editor, and run it. That applies all migrations in order.
- **Or run one by one:** Run each file in `supabase/migrations/` in numeric order (001, 002, 003, …). The `public.organizations` table is created in **002_create_organizations_table.sql**.

After new tables are created, the schema cache updates automatically. If anything still fails, run a simple query in the SQL Editor to refresh the cache.

## Backfill profiles (if you see an `organizations_owner_id_fkey` error)

If project creation fails with **"insert or update on table organizations violates foreign key constraint organizations_owner_id_fkey"**, the signed-in user has no row in `public.profiles` (e.g. they signed up before migrations ran). In the SQL Editor, run the contents of **`supabase/backfill-profiles.sql`** once. That inserts a profile for every `auth.users` user who is missing one. Then try creating a project again.

## Verify

In the SQL Editor, run:

```sql
SELECT 1 FROM public.organizations LIMIT 1;
```

If this runs without error, the table exists. Then reload the app and try creating a project again.
