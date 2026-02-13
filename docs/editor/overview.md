# Editor Features

Synapse's editor is built on Monaco (the engine behind VS Code) with Shopify-specific enhancements for Liquid, CSS, and JavaScript development.

![Editor overview showing file tree, tabs, editor, and preview](./images/editor-overview.png)

## File Explorer

The file explorer organizes your theme files into Shopify's standard directory structure:

| Directory | Contents |
|-----------|----------|
| `layout/` | Theme layouts (`theme.liquid`, `password.liquid`) |
| `templates/` | Page templates (JSON or Liquid) |
| `sections/` | Reusable page sections |
| `snippets/` | Reusable code fragments |
| `assets/` | CSS, JavaScript, images, fonts |
| `config/` | Theme settings (`settings_schema.json`, `settings_data.json`) |
| `locales/` | Translation files |

Files show last-edited timestamps ("2m ago", "yesterday") and snippet usage counts (e.g. `price.liquid (x4)`).

![File explorer with timestamps and usage counts](./images/editor-file-explorer.png)

## Tabs

- Drag tabs to reorder them
- Unsaved changes shown with an amber dot
- Middle-click to close a tab
- Right-click for context menu (Close, Close Others, Close All)

![File tabs with unsaved indicator and drag reorder](./images/editor-tabs.png)

## Breadcrumbs

Navigate nested Liquid structures with clickable breadcrumbs above the editor:

```
sections / hero-banner.liquid > {% schema %} > blocks > image
```

![Breadcrumbs showing nested Liquid navigation](./images/editor-breadcrumbs.png)

## Diagnostics

Real-time diagnostics catch errors as you type:

- **Liquid errors** — Unclosed tags, undefined variables, deprecated tags
- **JSON errors** — Invalid schema JSON
- **Accessibility warnings** — Missing alt attributes, form labels

![Diagnostics panel showing Liquid errors and warnings](./images/editor-diagnostics.png)

## Color Swatches

Hex, RGB, and HSL color values display inline swatches (12x12 px) directly in the editor.

![Inline color swatches in the editor](./images/editor-color-swatches.png)

## Command Palette

Press `Ctrl+P` (or `Cmd+P` on Mac) to open the command palette with:

- **Recent files** — Your last 5 edited files with timestamps
- **All files** — Fuzzy search across all theme files
- **Commands** — Available editor and AI commands

![Command palette with recent files](./images/editor-command-palette.png)

## Status Bar

The bottom status bar shows:
- Current file path and cursor position
- Active Shopify connection status
- Diagnostic counts (errors, warnings)
- Online/offline indicator
- Token usage for the current AI session

![Status bar with connection status and diagnostics](./images/editor-status-bar.png)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Command palette |
| `Ctrl+Shift+P` | Command palette (commands) |
| `Ctrl+S` | Save file |
| `Ctrl+D` | Select next occurrence |
| `Ctrl+L` | Open AI sidebar |
| `Ctrl+`` ` | Toggle theme console |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

See [Keyboard Shortcuts](../configuration/keyboard-shortcuts.md) for the full list.
