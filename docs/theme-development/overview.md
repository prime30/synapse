# Theme Development

Synapse provides IDE-level features for Shopify theme development — from intelligent code completion to visual dependency mapping.

![Theme development workflow showing editor, preview, and AI](./images/theme-dev-overview.png)

## Liquid Intelligence

### Object-Aware Completions

Type `{{ product.` and get completions for `.title`, `.price`, `.variants`, and 40+ Shopify objects with nested property chains.

![Object-aware completions for product properties](./images/theme-dev-completions.png)

### Schema Completions

Inside `{% schema %}` blocks, get completions for setting types, IDs, and labels. Type `{{ section.settings.` to see your real setting IDs.

### Go to Definition

`Ctrl+Click` on `{% render 'price-card' %}` navigates directly to `snippets/price-card.liquid`.

### Translation Completions

Inside `{{ '...' | t }}`, get completions from your `locales/en.default.json` keys.

### Auto-Close Tags

Typing `{% if %}` automatically inserts `{% endif %}`. Works for all block tags: `for`, `unless`, `case`, `capture`.

### Unused Variable Detection

Unused `{% assign %}` variables show yellow warning squiggles.

![Unused variable warning in the editor](./images/theme-dev-unused-var.png)

### Deprecated Tag Warnings

`{% include %}` shows a deprecation warning suggesting `{% render %}`. Deprecated filters like `| img_tag` are also flagged.

### HTML Auto-Rename

Rename `<div>` and the matching `</div>` updates automatically.

## Liquid Formatting

Format your Liquid files with proper indentation and normalized whitespace:

- Block tags are properly indented
- Whitespace is normalized
- Schema JSON is formatted
- Rule-based (not Prettier — designed for Liquid)

## Design Tokens

Synapse extracts design tokens from your theme:

| Token Type | Source |
|-----------|--------|
| Colors | CSS custom properties, Liquid color settings |
| Typography | Font families, sizes, weights |
| Spacing | Margin and padding patterns |

Tokens power AI suggestions, chromatic IDE theming, and consistency checks.

![Design token browser showing extracted colors](./images/theme-dev-tokens.png)

## Spatial Canvas

Visualize your theme's file dependencies as an interactive graph:

- **File nodes** show health indicators (diagnostic count, modified status)
- **Dependency edges** are color-coded by type (liquid_include, asset_reference, css_import)
- **Auto-layout** via dagre with pan, zoom, and minimap
- **Drop zone** for ad-hoc file grouping ("Drag files here to create a refactoring context")

![Spatial canvas showing theme file dependencies](./images/theme-dev-canvas.png)

Toggle between Editor and Canvas views using the toolbar.

## Chromatic IDE

Synapse subtly tints the IDE based on your active theme's color palette:

- **1.2-second transitions** on project switch
- **Per-region controls** — Enable/disable for sidebar, editor, preview, status bar
- **Intensity slider** (0–100%) in Settings > Appearance

![Chromatic IDE showing ambient color theming](./images/theme-dev-chromatic.png)

## Flow Visualizer

Toggle the flow visualizer in the editor gutter to see animated data flow paths through your Liquid code. Hover to inspect variable values at each point.

![Flow visualizer showing data paths through Liquid code](./images/theme-dev-flow.png)
