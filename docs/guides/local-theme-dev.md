# Local Theme Development with Synapse

## Overview
Synapse's preview shows your Shopify dev theme via the storefront proxy. For a faster feedback loop with hot-reload, you can run `shopify theme dev` locally and use Synapse for AI agent, file sync, and deployment.

## Setup

### Prerequisites
- Shopify CLI installed (`npm install -g @shopify/cli`)
- Theme files on disk (use Synapse's "Export to disk" or clone from Shopify)
- Synapse project connected to your store

### Running locally
1. Open your terminal (or use Cursor's integrated terminal)
2. Navigate to your theme directory
3. Run `shopify theme dev --store your-store.myshopify.com`
4. The local dev server starts at `http://127.0.0.1:9292`
5. Changes to local files reflect immediately in the browser

### Using with Synapse
- **Agent + preview**: Keep Synapse open for AI chat, code review, and the Shopify preview
- **Local preview**: Use the local dev server for instant feedback
- **Sync**: Enable "Auto-push on save" in Synapse's Shopify panel to keep Synapse's preview in sync
- **Deploy**: When ready, push from Synapse to your live/dev theme

## Preview in Synapse
Synapse's preview shows your **Shopify dev theme** (what's deployed). It depends on the theme being pushed to Shopify.
- **Auto-push on save**: Enable in the Shopify panel (per project) for automatic sync on file save
- **Manual push**: Click "Push to Shopify" in the Shopify panel

## Tips
- Use `shopify theme dev --live-reload=hot-reload` for CSS-only changes
- Run `npx theme-check` for Shopify linting (or use Synapse's built-in diagnostics)
- Synapse's AI agent can help debug theme issues even when you're developing locally

## With Cursor
If you use Cursor as your editor:
1. Connect Synapse via MCP (see docs/cursor-setup.md)
2. Run `shopify theme dev` in Cursor's terminal
3. Use Synapse MCP tools for preview, agent, and file sync from Cursor
