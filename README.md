# Synapse

AI-powered Shopify theme development platform built with Next.js, Supabase, and multi-provider AI infrastructure.

## Quick Start

1. Install [Cursor IDE](https://cursor.sh)
2. Clone this repository
3. Run `npm install`
4. Copy `.env.example` to `.env.local` and configure credentials
5. Run `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000)

For detailed setup instructions, see [docs/cursor-setup.md](docs/cursor-setup.md).

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Database:** Supabase (Postgres, Auth, Storage)
- **AI Providers:** Anthropic Claude, OpenAI GPT
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest + React Testing Library

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run type-check` | Run TypeScript compiler check |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |

## Project Structure

```
synapse/
├── app/                    # Next.js pages, layouts, and API routes
│   ├── api/                # Backend API routes
│   │   ├── auth/           # Authentication endpoints
│   │   ├── ai/             # AI provider endpoints
│   │   ├── files/          # File management endpoints
│   │   └── health/         # Health check endpoints
│   └── __tests__/          # Page component tests
├── components/
│   ├── ui/                 # Reusable UI components
│   └── features/           # Feature-specific components
├── lib/
│   ├── ai/                 # AI provider integrations
│   ├── auth/               # Authentication utilities
│   ├── errors/             # Error handling
│   ├── middleware/          # Middleware functions
│   ├── services/           # Business logic services
│   ├── storage/            # Storage utilities
│   ├── supabase/           # Supabase client utilities
│   └── types/              # Shared TypeScript types
├── supabase/
│   └── migrations/         # Database migration files
├── tests/
│   ├── integration/        # Integration tests
│   └── setup/              # Test utilities and helpers
├── docs/
│   ├── architecture/       # ADR documents
│   └── cursor-setup.md     # IDE setup guide
└── public/                 # Static assets
```

## Using Cursor AI

Cursor AI is configured with Synapse-specific context via `.cursorrules`.

**Recommended prompts:**
- "Generate a Liquid template for [component] following Synapse patterns"
- "Create an API route for [feature] with Supabase integration"
- "Add TypeScript types for [data structure]"
- "Review this code for Shopify best practices"

Use `@filename` to include specific files in your AI context.

## Architecture

See [docs/architecture/](docs/architecture/) for Architectural Decision Records (ADRs).

## License

Private
