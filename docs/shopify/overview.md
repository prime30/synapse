# Shopify Integration

Synapse connects directly to your Shopify store for theme management, live preview, and deployment.

![Shopify integration panel showing connected store](./images/shopify-overview.png)

## Connecting Your Store

1. Open the **Shopify** panel from the activity bar
2. Enter your store domain (e.g. `my-store.myshopify.com`)
3. Paste your Shopify Admin API access token
4. Click **Connect**

![Store connection form](./images/shopify-connect.png)

### Required Scopes

Your access token needs these scopes:

| Scope | Purpose |
|-------|---------|
| `read_themes` | Read theme files |
| `write_themes` | Push changes to themes |

> **Future scopes** (not yet required): `read_content`, `write_content`, `read_online_store_navigation`, `write_online_store_navigation`, `read_files`, `write_files`, `read_discounts`, `write_discounts`, `read_products`, `read_inventory`

## Importing Themes

After connecting, click **Import Theme** to pull a theme from your store:

1. Select a theme from the list (Live, unpublished, or development)
2. Enable **Create development theme for preview** (recommended)
3. Optionally add a note (e.g. "Import from Live, Feb 2026")
4. Click **Import**

![Theme import dialog showing available themes](./images/shopify-import.png)

Synapse creates a development theme on your store for safe preview. Your **live theme is never modified** during editing.

## Live Preview

The preview panel renders your theme through a same-origin proxy:

- **Pixel-perfect** Shopify rendering (not a local approximation)
- **Viewport controls** — Desktop (1024px), tablet (768px), mobile (375px)
- **Auto-refresh** after pushing changes

![Preview panel with viewport toggle](./images/shopify-preview.png)

## Pushing Changes

Changes are pushed to your **development theme** (not the live theme):

- **Auto-push** — Files push automatically when saved
- **Manual push** — Click "Push to Shopify" with an optional note
- **Push history** — Every push is recorded with timestamp, source, and file count

![Push history showing recent pushes](./images/shopify-push-history.png)

## Rollback

Restore your preview theme to any previous push:

1. Find the push in **Push History**
2. Click **Rollback to this**
3. Confirm the rollback

Your live store is never affected by rollbacks.

## Deploy Pre-flight

Before publishing to your live theme, Synapse runs a two-tier safety check:

### Tier 1: Quick Scan (< 2 seconds)

Runs automatically on every push. Checks for:
- Broken `{% render %}` references
- Missing asset files
- Unclosed Liquid tags
- Empty schema blocks
- Broken section references in template JSON

Critical issues **block** the push.

### Tier 2: Full AI Review (30–60 seconds)

Triggered manually via the **Review Theme** button or automatically before publishing to live. Produces a scored report across performance, accessibility, SEO, best practices, and Liquid quality.

![Deploy pre-flight results](./images/shopify-preflight.png)

## Theme Groups

Synapse organizes your imported files into logical groups matching Shopify's theme structure. Files are color-coded by type in the file explorer.
