# Quickstart

Get up and running with Synapse in under 5 minutes.

## Prerequisites

- A Shopify store (development or production)
- A Shopify Admin API access token with `read_themes` and `write_themes` scopes
- A modern browser (Chrome, Firefox, Edge, Safari)

## Step 1: Sign In

Navigate to your Synapse instance and sign in with your account.

![Sign in page](./images/quickstart-sign-in.png)

## Step 2: Create a Project

Click **New Project** from the dashboard. Give your project a name (e.g. "Dawn Customization").

![Create project dialog](./images/quickstart-create-project.png)

## Step 3: Connect Your Shopify Store

1. Open the **Shopify** panel in the activity bar
2. Enter your store domain (e.g. `my-store.myshopify.com`)
3. Paste your Admin API access token
4. Click **Connect**

![Shopify connection panel](./images/quickstart-connect-store.png)

> **Tip**: You can generate an access token in your Shopify Admin under **Settings > Apps and sales channels > Develop apps**.

## Step 4: Import a Theme

1. Click **Import Theme** 
2. Select your live theme (or any theme you want to edit)
3. Leave **Create development theme for preview** enabled (recommended)
4. Click **Import**

![Theme import dialog showing available themes](./images/quickstart-import-theme.png)

Synapse imports all theme files and sets up a live preview connected to a development theme on your store. Your live theme is never modified.

## Step 5: Start Editing

You're ready to go! The editor opens with your theme files in the sidebar. Click any file to open it.

![Editor with imported theme files](./images/quickstart-editor-ready.png)

### Try the AI Assistant

Open the AI sidebar (click the sparkle icon or press `Ctrl+L`) and ask:

- "Add a hero banner section with a background video"
- "Review this file for accessibility issues"
- "Why is this section not showing in the preview?"

### Try Live Preview

The preview panel shows your theme as it appears on Shopify. Changes push automatically to your development theme.

## Next Steps

- [Editor Features](../editor/overview.md) — Learn about file management, tabs, and diagnostics
- [AI Assistant](../ai/overview.md) — Explore chat, agents, and ambient intelligence
- [Keyboard Shortcuts](../configuration/keyboard-shortcuts.md) — Speed up your workflow
