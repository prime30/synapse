# Local Theme Dev with Synapse

## How the Synapse preview works

Synapse does **not** run a local Liquid renderer. Instead, it pushes your theme files to a Shopify **development theme** and proxies the storefront through a same-origin iframe. This means:

- You see pixel-perfect Shopify rendering (real storefront, real data).
- Apps, metafields, and dynamic sections work the same as in production.
- The preview theme is separate from your live theme — your store is never at risk.

## Auto-push on save

Automatic pushing is **opt-in**. Toggle it in the Shopify panel:

1. Open the **Shopify** panel (sidebar).
2. Check **Auto-push on save**.

When enabled, every file save triggers a push to the development theme. The preview iframe reloads automatically once the push completes.

When disabled, you control when changes go live via the **Push to Shopify** button (with an optional note for push history).

## Using `shopify theme dev` alongside Synapse

If you prefer the Shopify CLI's local hot-reload server for rapid CSS / Liquid iteration, you can run it in parallel:

```bash
# In Cursor's integrated terminal (or any terminal)
shopify theme dev --store my-store.myshopify.com --theme-editor-sync
```

This starts a local dev server (usually `http://127.0.0.1:9292`) that watches your local files and hot-reloads on save.

### Recommended workflow

| Step | Tool | What happens |
|------|------|-------------|
| Edit files | Synapse editor **or** Cursor (via MCP) | Files change on disk and in the Synapse project |
| Fast iteration | `shopify theme dev` in the terminal | Local hot-reload at `localhost:9292` |
| Full preview | Synapse preview panel | Storefront rendered through the dev theme proxy |
| Push to store | Auto-push on save **or** manual Push | Development theme updated, preview refreshes |
| Review | Synapse AI review / Deploy pre-flight | Quick scan + full AI report before going live |

You can keep both running at the same time. `shopify theme dev` watches the file system, so edits made in Synapse (or applied via MCP) are picked up automatically.

### Tips

- **Avoid conflicting pushes.** If auto-push is on in Synapse *and* `shopify theme dev` is pushing to the same theme, you may see flickering. Pick one push mechanism per theme, or point them at different themes.
- **Use `--theme` to target a specific theme ID** so the CLI doesn't collide with Synapse's dev theme:
  ```bash
  shopify theme dev --store my-store.myshopify.com --theme 123456789
  ```

## Agent-driven CLI commands (run-command)

Synapse agents can execute a limited set of CLI commands on the server when the feature flag is enabled:

```
ENABLE_RUN_COMMAND=1
```

Allowed commands (allowlist):

| Pattern | Example |
|---------|---------|
| `shopify theme *` | `shopify theme push`, `shopify theme pull` |
| `npm run *` | `npm run build` |
| `npx theme-check` | Lint theme files |
| `npx prettier *` | Format files |
| `shopify app *` | App CLI commands |
| `node --version` | Version check |
| `npm --version` | Version check |

Commands have a default 30-second timeout (max 120 seconds) and output is capped at 1 MB.

This is useful for agent workflows that need to lint, format, or push theme files as part of an automated pipeline.

## Preview reload behavior

When **Auto-push on save** is enabled:

1. You save a file in the editor.
2. The file is pushed to the Shopify development theme.
3. On successful push, the preview iframe reloads to show the updated storefront.

Manual pushes also trigger a preview reload on completion. Rollbacks refresh the preview automatically.
