# Synapse Desktop

Electron wrapper for the Synapse web application.

## Architecture

```
electron/
  main.js           - Main process: window management, tray, auto-updates
  preload.js        - Secure bridge between renderer and main process
  package.json      - Electron dependencies and electron-builder config
  entitlements.mac.plist - macOS code signing entitlements

build/
  icon.svg          - Source SVG for app icon
  icons/            - Generated PNG icons (all sizes)

scripts/
  generate-icons.ts - Generates platform icons from SVG
```

## Development

From the project root:

```bash
# Start Next.js dev server + Electron window
npm run dev:electron
```

This runs the web app at localhost:3000 and opens Electron pointed at it.

## Building Installers

```bash
# Generate icons first (required)
npm run icons

# Build for current platform
npm run build:desktop

# Build for specific platform
npm run build:desktop:win
npm run build:desktop:mac
npm run build:desktop:linux
```

Output goes to `electron/dist/`.

## How It Works

**Development:** Electron loads `http://localhost:3000` (Next.js dev server).

**Production:** The Next.js standalone server is bundled as an extra resource.
Electron's main process spawns it as a child process, waits for it to start,
then loads `http://127.0.0.1:3000` in the BrowserWindow.

## Auto-Updates

Configured via `electron-updater` with GitHub Releases as the provider.
Set the `publish` config in `package.json` to your actual GitHub repo.

To publish an update:
1. Bump version in `electron/package.json`
2. Build: `npm run build:desktop`
3. Upload artifacts to GitHub Release
4. The app will auto-detect and download updates

## Code Signing

### Windows
Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables with your
code signing certificate.

### macOS
Set `CSC_LINK`, `CSC_KEY_PASSWORD`, and configure notarization in the
build config. Requires an Apple Developer account.

### Linux
AppImage and .deb packages don't require code signing.
