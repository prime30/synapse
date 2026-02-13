# Synapse Documentation

Synapse is an AI-powered Shopify theme IDE. Edit Liquid, CSS, and JavaScript with intelligent assistance, live preview, and one-click deployment.

![Synapse IDE — AI-powered Shopify theme editor](./images/hero-synapse-ide.png)

## Quick Start

| Step | Description |
|------|-------------|
| 1. Create a project | Sign in and create your first Synapse project |
| 2. Connect your store | Link your Shopify store via Admin API token |
| 3. Import a theme | Pull your live theme into Synapse |
| 4. Start editing | Edit with AI assistance, live preview, and Liquid intelligence |

## Learn More

- **[Get Started](./get-started/quickstart.md)** — Download, install, and start building in minutes
- **[Editor Features](./editor/overview.md)** — File management, tabs, breadcrumbs, and diagnostics
- **[AI Assistant](./ai/overview.md)** — Chat, agents, ambient intelligence, and intent completion
- **[Shopify Integration](./shopify/overview.md)** — Connect, import, preview, and deploy themes
- **[Theme Development](./theme-development/overview.md)** — Liquid editing, language intelligence, design tokens
- **[Configuration](./configuration/overview.md)** — Settings, keyboard shortcuts, and theming
- **[Contributing](./contributing/overview.md)** — Architecture, development setup, and testing

## Feature Highlights

### AI-Powered Editing

Synapse's AI understands Shopify Liquid, CSS, and JavaScript. Ask it to generate sections, fix bugs, or review your entire theme.

![AI chat sidebar with code suggestions](./images/feature-ai-chat.png)

### Live Preview

See your changes instantly in a live Shopify preview. Toggle between desktop, tablet, and mobile viewports.

![Live preview panel showing a Shopify storefront](./images/feature-live-preview.png)

### Ambient Intelligence

Proactive nudges surface issues before you even open chat — missing schemas, broken references, accessibility gaps, and more.

![Ambient bar showing a proactive nudge](./images/feature-ambient-bar.png)

### Spatial Canvas

Visualize your theme's file dependencies as an interactive graph. Drag files to create refactoring contexts.

![Spatial canvas showing file dependency graph](./images/feature-spatial-canvas.png)

### Intent Completion

Synapse watches your workflow and offers to complete multi-step tasks automatically — rename propagation, section creation, locale sync.

![Intent completion panel with checkbox tree](./images/feature-intent-completion.png)

## Architecture

Synapse is built with:

| Technology | Purpose |
|-----------|---------|
| Next.js 16 | App framework (App Router) |
| Supabase | Database, auth, real-time |
| Monaco Editor | Code editing |
| React Flow | Spatial canvas |
| Anthropic / Google / OpenAI | AI providers |
| Shopify Admin API | Theme management |
