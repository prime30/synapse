# AGENTS.md

## Cursor Cloud specific instructions

### HARD RULE: Never write to Shopify

**Agents must NEVER push, write, create, update, or delete any data on Shopify.** This includes themes, assets, files, products, pages, collections, discounts, inventory, navigation menus, and any other Shopify resource. All Shopify API interactions during testing must be **read-only** (GET requests / read queries only). This rule applies to manual testing, automated tests, and any code execution. Violating this rule risks corrupting a live store.

### Overview

Synapse is an AI-powered Shopify theme development platform. It is a Next.js 16 app (App Router, TypeScript) backed by Supabase (Postgres, Auth, Storage) with multi-provider AI (Anthropic, OpenAI, Google).

### Running the dev server

- `npm run dev` starts the Next.js dev server on **port 3000** (uses webpack mode).
- The dev server starts successfully with placeholder Supabase credentials — real keys are needed only for auth/DB-dependent flows.
- If the dev server fails to start, delete `.next/dev/lock` first.

### Key commands

See `package.json` scripts and `README.md` for the full list. Highlights:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Tests (once) | `npm run test:run` |
| Tests (watch) | `npm test` |
| Type check | `npm run type-check` |
| Build | `npm run build` |

### Environment variables

- Copy `.env.example` to `.env.local`. Minimum required for dev server startup: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- Redis (Upstash) is optional — falls back to in-memory Map when unset.
- AI provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`) are required only for AI chat/agent features; the app starts without them.

### Pre-existing test failures

Some test files have pre-existing failures unrelated to environment setup:
- `tests/integration/v2-coordinator.test.ts` — `ReferenceError: lastMutationFailure is not defined` (code-level bug in `coordinator-v2.ts`)
- `tests/integration/enactment-reliability.test.ts` — `extractTargetRegion is not a function` (missing export)
- `tests/integration/superpowers-integration.test.ts` — `parseReviewToolContent is not a function` (missing export)

These are codebase issues, not environment problems. Expect ~121/130 test files to pass and ~1356/1403 tests to pass.

### Pre-existing lint warnings

ESLint exits with warnings (mostly `@typescript-eslint/no-unused-vars` and `react-hooks/set-state-in-effect`). These are pre-existing and not blocking for development.

### Authentication for manual testing

- The sign-in page is at `/auth/signin`. In dev mode a "Dev Quick Login" button auto-creates accounts using `SUPABASE_SERVICE_ROLE_KEY`.
- **New user creation may fail** with "Database error creating new user" if the Supabase project's auth triggers are broken or the DB schema is missing. In that case, reset an existing user's password via the Supabase Admin API (`PUT /auth/v1/admin/users/{id}`) and log in with those credentials.
- The onboarding wizard at `/onboarding` gates IDE access behind a Shopify store connection. You can skip steps via `?step=import` and then "Skip for now", but reaching the IDE (`/projects/{id}`) requires a `shopify_connections` record. Without it, the smart gate in `OnboardingWizard.tsx` redirects back to onboarding.
- Projects can be created via `POST /api/projects` (cookie-based auth required; Bearer tokens alone don't work for cookie-dependent server components).

### Gotchas

- The `npm run lint` command runs ESLint plus two custom scripts (`check-no-emoji.mjs` and `check-supabase-migration-versions.mjs`).
- Next.js build uses `--webpack` flag (not Turbopack) for both dev and production.
- The workspace rule `.cursor/rules/dev-server.mdc` requires the dev server to always run on port 3000.
- `node-pty` (native addon in devDependencies) may produce build warnings during `npm install` — this is normal and does not affect functionality.
- The `/projects` route is a server-side redirect to `/onboarding` — there is no standalone projects list page.
