# Shopify: Import with preview theme & push history

**Last updated:** When this feature was added. Update this doc when you change behavior, APIs, or schema.

## Overview

- **Import from store** can optionally create/use a development theme and push imported files to it so preview works immediately.
- **Push history** records every push to the dev theme (import, manual push, auto-save). Users can add notes and **rollback** the preview theme to a previous push.
- **Safety:** We never push to the live theme (`role === 'main'`). Server-side checks enforce this.

## User-facing behavior

- **Import modal (From Store):** Toggle “Create a development theme for preview (recommended)” and optional “Preview note”. After pull, we call `POST .../shopify/setup-preview-theme` to ensure a dev theme, mark theme_files pending, push, and record history with trigger `import`.
- **Shopify panel:** Push history list (date, note, trigger, file count). “Rollback to this” with confirmation. Optional “Note” for manual Push. Preview refreshes after rollback.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/[projectId]/shopify/setup-preview-theme` | After import: ensure dev theme, push, record history. Body: `{ note?: string }`. |
| GET | `/api/projects/[projectId]/shopify/push-history` | List recent pushes (id, pushed_at, note, trigger, file_count). No snapshot in list. |
| POST | `/api/projects/[projectId]/shopify/push-history/[pushId]/rollback` | Restore preview to that push. Returns `{ restored, errors? }`. |

Sync route: for **push**, we always use `connection.theme_id` (never the “import from” theme). Optional `note` in body is stored in push history with trigger `manual`. Push-queue records with trigger `auto_save` and note “Auto-push after save”.

## Schema

- **Table:** `theme_push_history` (see `supabase/migrations/024_theme_push_history.sql`).
- **Columns:** id, connection_id, theme_id, pushed_at, note, trigger (`manual` \| `import` \| `auto_save` \| `rollback`), snapshot (JSONB).
- **Snapshot:** `{ "files": [ { "path", "content" } ] }`. Capped (e.g. 500 files, skip content > 100KB). Used only for rollback.

## Safety

- Before any push (setup-preview-theme, sync push), we call Admin API `getTheme(theme_id)`. If `role === 'main'`, return 403.
- Rollback: same check; if theme missing, return 404 with clear message.
- RLS on `theme_push_history` limits access to org members for their project’s connection.

## Running the migration

Apply the migration in each environment (local, staging, production):

```bash
# Local (Supabase CLI)
npx supabase db push

# Or run the migration file manually against your DB
psql $DATABASE_URL -f supabase/migrations/024_theme_push_history.sql
```

See [Deployment / migrations](../deployment/migrations.md) or [merge checklist](../deployment/merge-checklist.md) if your flow differs.
