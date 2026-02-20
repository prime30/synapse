# Synapse + Cursor Integration

## Overview
Use Cursor as your desktop IDE and Synapse as the AI brain for Shopify themes.

## Setup
1. Install the Synapse MCP server (see mcp-server/README.md)
2. Add Synapse MCP to your Cursor settings
3. Add `.cursor/rules/` from your Synapse project for AI context

## What Synapse adds to Cursor
- **Shopify-specialized AI agents** with Liquid, CSS, and JavaScript specialists
- **Live storefront preview** via the Synapse web app
- **Theme sync** — push/pull between local files and Shopify
- **Schema validation** — checks section settings against `{% schema %}`
- **Design token management** — consistent styling across theme files

## Workflow
1. Edit files in Cursor (local terminal, extensions, debugger)
2. Use Synapse MCP tools for theme-specific operations:
   - `synapse_execute_agents` — run AI agents on your files
   - `synapse_sync_workspace_to_project` — sync local changes to Synapse
   - `synapse_inspect_preview` — inspect the live preview DOM
3. Preview in Synapse web app (or run `shopify theme dev` locally)
4. Deploy via Synapse when ready
