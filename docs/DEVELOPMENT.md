# Synapse Development Guide

## Setup

```bash
npm install
cp .env.example .env.local
# Add Supabase credentials to .env.local
npm run dev
```

## BrainGrid CLI (optional)

If you use [BrainGrid](https://app.braingrid.ai) for requirements and tasks, use the CLI instead of the MCP server for lower token usage and the full spec-to-ship workflow. This repo’s workflow rule (`.cursor/rules/braingrid-workflow.mdc`) is written for the CLI.

**Windows 11 (PowerShell or Command Prompt):**

1. Install and log in (one-time):
   ```bash
   npm install -g @braingrid/cli
   braingrid login
   ```

2. In this repo, link your BrainGrid project:
   ```bash
   braingrid init
   ```

3. Optional — Cursor slash commands and task hooks:
   ```bash
   braingrid setup cursor
   ```

If you have the BrainGrid MCP server enabled in Cursor (user settings), disable it after the CLI is working so the agent doesn’t load MCP tool definitions on every request. See [BrainGrid CLI docs](https://www.npmjs.com/package/@braingrid/cli) for more.

## Workflow (REQ-77 Multi-Agent Coordination)

### Branch Strategy

- Use `feature/req-{number}` for requirement work (e.g. `feature/req-77`)
- One branch per agent when running parallel streams
- Merge after integration checkpoints

### TDD Workflow

1. Write tests first
2. Implement to pass tests
3. Run `npm run test:run` and ensure green
4. Target 80% coverage; run `npm run test:run -- --coverage` to check

### Contract Compliance

- Check `synapse-coordination/contracts.md` and `contracts/` before integrating
- Validate with Zod when consuming shared types
- Update contracts when interfaces change; list in PR

### Before Submitting PR

- [ ] Tests pass: `npm run test:run`
- [ ] Lint: `npm run lint`
- [ ] Type-check: `npm run type-check`
- [ ] Format: `npm run format:check`
- [ ] Contracts updated if interfaces changed
- [ ] `status.json` updated in synapse-coordination if coordinating agents

### Quality Gate (CI)

PRs run:

- Tests with coverage
- Lint
- Type-check
- Format check (non-blocking)

See `.github/workflows/quality-gate.yml`.

## Project Structure

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router pages and API |
| `components/` | React components |
| `lib/` | Shared logic, types, services |
| `docs/` | Architecture (ADRs), deployment, internal, user |
| `supabase/migrations/` | Database schema |

## Keeping documentation updated

When you change behavior that affects users or other developers, update the docs in the same PR:

- **User-facing behavior** (UI, flows, features) → update or add a guide under `docs/user/`. See [User docs](user/README.md).
- **Internal/technical** (APIs, schema, safety, runbooks) → update or add under `docs/internal/`. See [Internal docs](internal/README.md).
- **Architecture decisions** → add or update an ADR under `docs/architecture/`.
- **Deployment/ops** (env vars, migrations, staging) → update `docs/deployment/` or `supabase/README.md`.

After adding a new migration, run it in each environment (local, staging, prod). See [Migrations](deployment/migrations.md).

## Related

- [Architecture ADRs](architecture/README.md)
- [Branch naming and protection](deployment/branch-naming-and-protection.md)
- [REQ-77](https://app.braingrid.ai/requirements/overview?id=REQ-77) – Multi-agent coordination framework
