# Concepts

Core concepts that power the Synapse IDE.

## Projects

A Synapse project is a workspace containing all the files for a Shopify theme. Each project can be connected to one Shopify store.

![Project dashboard showing multiple projects](./images/concepts-projects.png)

## Files and the Editor

Synapse uses Monaco Editor (the same editor powering VS Code) with Shopify-specific enhancements:

- **Liquid syntax highlighting** — Full support for Liquid tags, objects, and filters
- **Schema-aware editing** — Autocomplete for `{% schema %}` blocks
- **Diagnostics** — Real-time error detection for Liquid, CSS, and JSON
- **Breadcrumbs** — Navigate nested Liquid structures with clickable breadcrumbs

![Editor with Liquid syntax highlighting and breadcrumbs](./images/concepts-editor.png)

## AI Modes

Synapse supports two AI execution modes:

| Mode | Description |
|------|-------------|
| **Orchestrated** | The PM agent delegates to specialist agents (Liquid, CSS, JS) and a review agent validates changes. Best for complex, multi-file tasks. |
| **Solo** | A single PM agent handles everything in one pass. Faster for simple tasks. |

![Mode toggle in the AI sidebar input bar](./images/concepts-ai-modes.png)

## Preview

The preview panel renders your theme through a Shopify proxy, giving you pixel-perfect accuracy. Changes are reflected after pushing to your development theme.

![Preview panel with viewport controls](./images/concepts-preview.png)

## Design Tokens

Synapse extracts design tokens (colors, typography, spacing) from your theme and uses them to provide consistent AI suggestions and chromatic IDE theming.

## Context Engine

The AI builds context from:
1. **Active file** — The file you're currently editing
2. **Dependencies** — Files referenced via `{% render %}`, `{% include %}`, or `asset_url`
3. **Selection** — Any text you've selected in the editor
4. **Preview DOM** — The live preview's DOM structure (when preview is open)
5. **Conversation history** — Prior messages in the current chat session

## Ambient Intelligence

Synapse proactively scans your work and surfaces nudges when it detects issues — missing schemas, unused variables, broken references, and more. No need to ask; the AI comes to you.

## Intent Completion

When Synapse recognizes a multi-step workflow (like renaming a file), it offers to complete all related steps automatically — updating references, template JSON files, and locale entries.
