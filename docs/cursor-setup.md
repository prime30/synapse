# Cursor IDE Setup Guide for Synapse

## Prerequisites

- **Node.js** v18+ (LTS recommended)
- **Git** installed and configured
- **Supabase account** — [https://supabase.com](https://supabase.com)
- **AI provider accounts** (one or both):
  - Anthropic — [https://console.anthropic.com](https://console.anthropic.com)
  - OpenAI — [https://platform.openai.com](https://platform.openai.com)

## 1. Install Cursor IDE

1. Download from [https://cursor.sh](https://cursor.sh)
2. Install and launch
3. If migrating from VS Code, import your settings when prompted

## 2. Clone the Repository

```bash
git clone https://github.com/prime30/synapse.git
cd synapse
```

## 3. Install Dependencies

```bash
npm install
```

## 4. Configure Environment

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

## 5. Install Recommended Extensions

When you open the project, Cursor will prompt you to install recommended extensions. Alternatively, install manually:

- **Shopify Liquid** (`Shopify.theme-check-vscode`) — Liquid syntax highlighting, linting, autocomplete
- **ES7+ React/Redux snippets** (`dsznajder.es7-react-js-snippets`) — React component snippets
- **ESLint** (`dbaeumer.vscode-eslint`) — JavaScript/TypeScript linting
- **Prettier** (`esbenp.prettier-vscode`) — Code formatting
- **Error Lens** (`usernamehw.errorlens`) — Inline error highlighting
- **PostgreSQL** (`ckolkman.vscode-postgres`) — Supabase database query support

## 6. Verify Setup

```bash
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) — you should see the Synapse landing page.

Run additional checks:

```bash
npm run build        # Build for production
npm run lint         # Check for linting errors
npm run type-check   # Validate TypeScript types
```

## Using Cursor AI

Cursor AI is configured with Synapse-specific context via `.cursorrules`. The AI assistant automatically understands:

- Synapse architecture (Next.js, Supabase, multi-agent system)
- File organization conventions
- API patterns and error handling formats
- TypeScript standards
- Shopify Liquid best practices

### Recommended Prompts

- "Generate a Liquid template for [component] following Synapse patterns"
- "Create an API route for [feature] with Supabase integration"
- "Add TypeScript types for [data structure]"
- "Review this code for Shopify best practices"

### Tips

- Use `@filename` to include specific files in your AI context
- Reference existing files when asking for similar implementations
- Cursor reads `.cursorrules` automatically on project open

## Troubleshooting

### Missing Environment Variables
If you see connection errors, verify all variables in `.env.local` are set. The app requires at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Extensions Not Working
Restart Cursor after installing extensions. For Liquid files, ensure the file has a `.liquid` extension.

### TypeScript Errors
Run `npm run type-check` to see all TypeScript errors. Ensure your editor is using the workspace TypeScript version (check bottom-right status bar).

### Supabase Connection Issues
Verify your Supabase project is running and credentials are correct. Test with:
```bash
curl https://YOUR_PROJECT.supabase.co/rest/v1/ -H "apikey: YOUR_ANON_KEY"
```
