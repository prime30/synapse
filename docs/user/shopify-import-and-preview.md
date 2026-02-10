# Shopify: Import theme and preview

## Import a theme from your store

1. Open your project and go to **Import theme**.
2. Choose **From Store**.
3. Connect with your store domain and Admin API token (if not already connected).
4. Select the theme you want to import (e.g. your Live theme).
5. **Create a development theme for preview (recommended)** — leave this **on** so that after import, Synapse pushes the theme to a dedicated preview theme and your preview iframe shows the imported theme right away.
6. Optionally add a **Preview note** (e.g. “Import from Live, Jan 2025”) to label this in push history.
7. Click **Import theme**. You’ll see “1. Importing theme…” then “2. Setting up preview theme…”. When done, you’ll see “Imported N files. Preview theme is ready.”

Only your **preview** theme is updated; your **live store is not changed**.

If setup fails after import, use **Retry setup preview** to try again.

## Push history and rollback

Every push to your preview theme is recorded (after import, when you click “Push to Shopify,” or when you save a file and it auto-pushes). In the **Shopify** panel you’ll see **Push history** with:

- When the push happened
- Optional note
- Source: Manual, After import, Auto-save, or Rollback
- Number of files

To restore your preview to an earlier push:

1. Find that push in the list.
2. Click **Rollback to this**.
3. Confirm: “Restore preview theme to this push? Current preview state will be overwritten. Your live store is not affected.”
4. After rollback, the preview iframe refreshes and you’ll see a short success message.

The most recent push is marked **Current**; you can’t rollback to it (you’re already there).

## Optional note when pushing manually

When you click **Push to Shopify**, you can type an optional **Note** (e.g. “Homepage update”) so that push appears in history with your label.
