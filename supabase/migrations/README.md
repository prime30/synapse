# Migration Versioning Rules

To keep `supabase db push` deterministic and avoid `schema_migrations` conflicts:

- Use one unique numeric prefix per migration file (example: `052_feature_name.sql`).
- Never create two files with the same numeric prefix.
- Keep migrations idempotent when practical (`IF NOT EXISTS`, guarded `DO $$` blocks).
- Prefer additive schema changes over destructive rewrites.

Validation:

- Run `npm run lint:migrations` locally.
- CI runs the same check through `npm run lint`.

If a migration was accidentally duplicated in the past, create a new uniquely-versioned
follow-up migration rather than reusing an existing prefix.
