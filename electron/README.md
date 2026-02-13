# Synapse Desktop (Option A — thin wrapper)

This folder contains an Electron wrapper that opens a window to the Synapse web app. No local Next.js server; the app loads your deployed URL (or localhost for development).

## Run locally

1. Install dependencies (once):

   ```bash
   cd electron && npm install
   ```

2. Start the desktop app:

   ```bash
   npm run start
   ```

   By default the window loads `https://synapse.so`. To point at your local dev server instead:

   ```bash
   # Windows (PowerShell)
   $env:APP_URL="http://localhost:3000"; npm run start

   # macOS / Linux
   APP_URL=http://localhost:3000 npm run start
   ```

   Ensure the Next.js app is running (`npm run dev` in the repo root) when using a local URL.

## Build installers

From the `electron` directory:

- **macOS:** `npm run build:mac`
- **Windows:** `npm run build:win`
- **Linux:** `npm run build:linux`

Output is in `electron/dist/`. For a custom app icon, add `icon.png` in this folder (e.g. 256×256 or 512×512) and include it in the `build.files` in `package.json` if needed.

## Config

- **APP_URL** or **NEXT_PUBLIC_APP_URL** — URL to load in the window. Default: `https://synapse.so`.
