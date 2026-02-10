# Synapse Development Guide

## Setup

```bash
npm install
cp .env.example .env.local
# Add Supabase credentials to .env.local
npm run dev
```

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
