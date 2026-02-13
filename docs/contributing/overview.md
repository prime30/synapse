# Contributing

Technical guide for Synapse contributors.

## Architecture

![Architecture diagram showing Next.js, Supabase, and Shopify](./images/contributing-architecture.png)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Editor | Monaco Editor |
| Styling | Tailwind CSS |
| Testing | Vitest + React Testing Library |
| AI Providers | Anthropic, Google AI, OpenAI |
| Shopify | Admin REST API |
| Canvas | React Flow + dagre |

### Project Structure

```
app/                    # Next.js App Router pages and API routes
  api/                  # API routes (agents, projects, stores, files)
  projects/             # Project pages
  auth/                 # Authentication pages
components/             # React components
  ai-sidebar/           # AI chat, ambient bar, intent completion
  editor/               # Monaco editor, breadcrumbs, status bar
  features/             # Feature-specific components
  preview/              # Preview panel
  canvas/               # Spatial canvas
  providers/            # Context providers
hooks/                  # React hooks
lib/                    # Shared logic
  ai/                   # AI services (context engine, signals, patterns)
  agents/               # Agent system (PM, specialists, prompts)
  shopify/              # Shopify API client, sync, auth
  liquid/               # Liquid parser, validators, formatters
  design-tokens/        # Design token extraction
  preview/              # Preview URL generation, DOM context
docs/                   # Documentation
supabase/               # Database migrations
mcp-server/             # MCP server for external tooling
```

## Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd synapse

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add your credentials to .env.local:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - ANTHROPIC_API_KEY
# - GOOGLE_AI_API_KEY (optional)
# - OPENAI_API_KEY (optional)

# Start the dev server
npm run dev
```

## Testing

```bash
# Run all tests
npm run test:run

# Run tests in watch mode
npm test

# Run with coverage
npm run test:run -- --coverage

# Run a specific test file
npm run test:run -- lib/ai/__tests__/signal-detector.test.ts
```

### Test Coverage Targets

| Area | Target |
|------|--------|
| `lib/` | 80%+ |
| `hooks/` | 70%+ |
| `components/` | 60%+ |
| `app/api/` | 80%+ |

## Code Quality

```bash
# Lint
npm run lint

# Type check
npm run type-check

# Format check
npm run format:check
```

## PR Checklist

Before submitting a pull request:

- [ ] Tests pass: `npm run test:run`
- [ ] Lint clean: `npm run lint`
- [ ] Types check: `npm run type-check`
- [ ] Documentation updated for user-facing changes
- [ ] No secrets in committed files

## EPIC Execution

Synapse is built using an EPIC-based execution plan. Each EPIC is a shippable increment with acceptance criteria. See `.cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md` for the full plan.

### Dependency Tracks

- **Track A** (AI Pipeline): E1a → E1b → E1c → E5 → E8 → E12 → E13
- **Track B** (Editor/IDE): E1a → E3 → E7
- **Track C** (Shopify): E8 → E9 → E10 → E11
- **Track D** (Foundations): E1a → E4 → E16
- **Track E** (Language): E1a → E4 → E6
- **Track F** (Memory): E8 → E14

EPICs on independent tracks can be built in parallel.
