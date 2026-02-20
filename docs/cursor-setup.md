# Synapse + Cursor / VS Code

This guide covers two use cases:

1. **Using the Synapse MCP server** to control Synapse from Cursor (theme editing workflow).
2. **Contributing to the Synapse codebase** in Cursor (developer setup).

---

## Part 1: Using Synapse MCP from Cursor

The Synapse MCP server (`mcp-server/`) lets Cursor's AI agent interact with your Synapse projects: sync files, run AI agents, apply proposed changes, and inspect the live preview -- all without leaving Cursor.

### Install the MCP server

```bash
cd mcp-server
npm install
npm run build
```

This compiles the TypeScript source to `mcp-server/dist/`.

### Configure Cursor

Add the Synapse MCP server to your Cursor config. Open **Settings > MCP Servers** (or edit `.cursor/mcp.json`) and add:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["<path-to-synapse>/mcp-server/dist/index.js"]
    }
  }
}
```

Replace `<path-to-synapse>` with the absolute path to your Synapse checkout.

#### Optional environment overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `SYNAPSE_API_URL` | `https://api.synapse.shop` | Point to a local or staging instance |
| `SYNAPSE_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |

### Authenticate

On first use, the agent will call `synapse_authenticate`. This opens your browser to complete Google OAuth login. A token is stored in `~/.synapse/` and refreshed automatically.

### Available MCP tools

| Tool | Purpose |
|------|---------|
| `synapse_authenticate` | Log in via Google OAuth (browser opens) |
| `synapse_create_project` | Create a new Synapse project |
| `synapse_list_projects` | List your projects |
| `synapse_sync_workspace_to_project` | Push local theme files to a Synapse project. Call before running agents so they see the latest content. |
| `synapse_add_files` | Add specific files from workspace to a project |
| `synapse_execute_agents` | Run the multi-agent system on a user request |
| `synapse_apply_changes` | Write AI-proposed changes back to local workspace files (atomic writes with backup) |
| `synapse_get_preferences` | Retrieve learned user preferences (coding style, patterns) |
| `synapse_inspect_preview` | Inspect the live Shopify preview DOM: find elements, list app widgets, get stylesheets, page snapshot |
| `synapse_generate_image` | Generate images (hero banners, product imagery) via Nano Banana Pro |
| `synapse_generate_video` | Generate short video clips via Veo 3.1 |

### Typical workflow

1. **Open your theme folder** in Cursor.
2. **Sync** workspace to Synapse: the agent calls `synapse_sync_workspace_to_project` to upload your local files.
3. **Ask the agent** to make changes (e.g. "Add a testimonials section to the homepage"). The agent calls `synapse_execute_agents`, which runs the AI pipeline.
4. **Review** the proposed changes in the diff view.
5. **Apply** changes: `synapse_apply_changes` writes the files to your workspace atomically (with backup).
6. **Preview** in Synapse's preview panel to verify the storefront rendering.
7. **Iterate**: edit in Cursor, re-sync, re-run agents as needed.

### Inspecting the preview

The `synapse_inspect_preview` tool lets the agent query the live Shopify storefront DOM without opening a browser. Actions:

- `getPageSnapshot` -- lightweight DOM tree of the visible page
- `inspect` -- find elements matching a CSS selector
- `querySelector` -- detailed info on a single element
- `listAppElements` -- discover third-party / app-injected elements
- `getStylesheets` -- list all loaded stylesheets (theme + apps)

The preview must be open in the Synapse IDE for inspection to work.

### Tips

- **Cursor for code + terminal.** Use Cursor for general editing, Git, and running `shopify theme dev` or other CLI tools.
- **Synapse for preview + AI.** Use Synapse's web IDE for the live storefront preview, AI agent conversations, and theme-specific tools (push, rollback, deploy pre-flight).
- **Cursor rules.** Synapse ships a `.cursorrules` file with project context (architecture, conventions, Liquid patterns). Cursor reads it automatically. See also `.cursor/rules/` for topic-specific rules.

---

## Part 2: Developer setup (contributing to Synapse)

### Prerequisites

- **Node.js** v18+ (LTS recommended)
- **Git** installed and configured
- **Supabase account** -- https://supabase.com
- **AI provider accounts** (one or both):
  - Anthropic -- https://console.anthropic.com
  - OpenAI -- https://platform.openai.com

### Clone and install

```bash
git clone https://github.com/prime30/synapse.git
cd synapse
npm install
```

### Configure environment

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |

### Recommended extensions

- **Shopify Liquid** (`Shopify.theme-check-vscode`) -- Liquid syntax highlighting, linting, autocomplete
- **ESLint** (`dbaeumer.vscode-eslint`) -- JavaScript/TypeScript linting
- **Prettier** (`esbenp.prettier-vscode`) -- Code formatting
- **Error Lens** (`usernamehw.errorlens`) -- Inline error highlighting

### Verify setup

```bash
npm run dev
```

Navigate to http://localhost:3000. Run additional checks:

```bash
npm run build
npm run lint
npm run type-check
```

### Using Cursor AI for development

Cursor AI is configured with Synapse-specific context via `.cursorrules`. The AI assistant automatically understands the architecture (Next.js, Supabase, multi-agent system), file conventions, API patterns, and Liquid best practices.

**Useful prompts:**

- "Generate a Liquid template for [component] following Synapse patterns"
- "Create an API route for [feature] with Supabase integration"
- "Review this code for Shopify best practices"

**Tips:**

- Use `@filename` to include specific files in your AI context.
- Cursor reads `.cursorrules` automatically on project open.

### AI modes and orchestration

Cursor doesn't have a built-in mode switcher. You can get the same effect by what you say. See `.cursor/rules/modes-and-single-agent.mdc` for a plan / agent / ask / debug reference.

**Orchestration quick prompt** (for plan execution):

```
Act as PM: orchestrate the plan in this file [or @.cursor/plans/<name>.plan.md].
Execute tasks in dependency tiers (Tier 0, 1, 2, 3, 4).
Lint and test after each tier. When all tiers are done, review the work.
```

To **turn off orchestration**: say "Single agent only" or "No orchestration, just do it yourself."

## Troubleshooting

### Missing environment variables
Verify all variables in `.env.local` are set. The app requires at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Extensions not working
Restart Cursor after installing extensions. For Liquid files, ensure the file has a `.liquid` extension.

### TypeScript errors
Run `npm run type-check`. Ensure your editor is using the workspace TypeScript version (check bottom-right status bar).

### MCP server not connecting
- Confirm the `dist/` folder exists (`cd mcp-server; npm run build`).
- Check that the path in your MCP config is absolute and correct.
- Look at `~/.synapse/synapse-mcp.log` for server-side errors.
