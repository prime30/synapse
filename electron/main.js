const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

const IS_DEV = !app.isPackaged;
const APP_NAME = 'Synapse';
const DEV_PORT = 3000;
const PROD_PORT = 3000;

let mainWindow = null;
let tray = null;
let nextServer = null;
let splashWindow = null;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getIconPath() {
  if (IS_DEV) {
    return path.join(__dirname, '..', 'build', 'icons', 'icon.png');
  }
  return path.join(process.resourcesPath, 'icons', 'icon.png');
}

function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timed out waiting for port ${port}`));
      }
      const socket = new net.Socket();
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        setTimeout(tryConnect, 200);
      });
      socket.connect(port, '127.0.0.1');
    }
    tryConnect();
  });
}

/* ------------------------------------------------------------------ */
/*  Splash screen                                                      */
/* ------------------------------------------------------------------ */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
          background: #0a0a0a;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          border-radius: 16px;
          overflow: hidden;
          user-select: none;
          -webkit-app-region: drag;
        }
        .logo {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 24px;
        }
        .accent { color: #28CD56; }
        .bar-container {
          width: 180px;
          height: 3px;
          background: rgba(255,255,255,0.08);
          border-radius: 2px;
          overflow: hidden;
        }
        .bar {
          height: 100%;
          width: 30%;
          background: #28CD56;
          border-radius: 2px;
          animation: slide 1.2s ease-in-out infinite;
        }
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(600%); }
        }
        .version {
          margin-top: 16px;
          font-size: 11px;
          color: rgba(255,255,255,0.25);
        }
      </style>
    </head>
    <body>
      <div class="logo">SYN<span class="accent">&Lambda;</span>PSE</div>
      <div class="bar-container"><div class="bar"></div></div>
      <div class="version">Loading...</div>
    </body>
    </html>
  `)}`);

  splashWindow.center();
}

/* ------------------------------------------------------------------ */
/*  Next.js production server                                          */
/* ------------------------------------------------------------------ */

function startNextServer() {
  if (IS_DEV) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const serverPath = path.join(process.resourcesPath, 'standalone', 'server.js');

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PROD_PORT),
      HOSTNAME: '127.0.0.1',
      NEXT_PUBLIC_ENABLE_LOCAL_SYNC: '1',
    };

    nextServer = spawn(process.execPath, [serverPath], {
      env,
      cwd: path.join(process.resourcesPath, 'standalone'),
      stdio: 'pipe',
    });

    nextServer.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Ready') || msg.includes('started')) {
        resolve();
      }
    });

    nextServer.stderr.on('data', (data) => {
      console.error('[next-server]', data.toString());
    });

    nextServer.on('error', reject);
    nextServer.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Next.js server exited with code ${code}`);
      }
      nextServer = null;
    });

    setTimeout(() => resolve(), 8000);
  });
}

/* ------------------------------------------------------------------ */
/*  Main window                                                        */
/* ------------------------------------------------------------------ */

function createMainWindow() {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: APP_NAME,
    icon: iconPath,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  const port = IS_DEV ? DEV_PORT : PROD_PORT;
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.destroy();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/* ------------------------------------------------------------------ */
/*  Application menu                                                   */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Theme Folder...',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Import Shopify Theme Folder',
              properties: ['openDirectory'],
              buttonLabel: 'Import',
            });
            if (!result.canceled && result.filePaths[0]) {
              mainWindow.webContents.send('menu:import-folder', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://synapse.so/docs'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/synapse/desktop/issues'),
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/*  System tray                                                        */
/* ------------------------------------------------------------------ */

function createTray() {
  const iconPath = getIconPath();
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    return;
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Synapse',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: syncStatus === 'syncing' ? 'Syncing...' : 'Local sync active',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Auto-updater                                                       */
/* ------------------------------------------------------------------ */

function setupAutoUpdater() {
  if (IS_DEV) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Synapse v${info.version} has been downloaded. It will be installed when you restart the app.`,
        buttons: ['Restart Now', 'Later'],
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

/* ------------------------------------------------------------------ */
/*  Background file watcher (tray sync daemon)                         */
/* ------------------------------------------------------------------ */

let fileWatcher = null;
let syncStatus = 'idle'; // 'idle' | 'syncing' | 'error'

function getSyncDir() {
  if (IS_DEV) {
    return path.join(process.cwd(), '.synapse-themes');
  }
  return path.join(process.resourcesPath, 'standalone', '.synapse-themes');
}

function updateTrayStatus(status) {
  syncStatus = status;
  if (!tray) return;

  const labels = {
    idle: 'Synapse — Synced',
    syncing: 'Synapse — Syncing...',
    error: 'Synapse — Sync error',
  };
  tray.setToolTip(labels[status] || APP_NAME);
}

async function startBackgroundWatcher() {
  const syncDir = getSyncDir();

  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true });
  }

  let chokidar;
  try {
    chokidar = require('chokidar');
  } catch {
    console.warn('[BackgroundSync] chokidar not available, skipping watcher');
    return;
  }

  const META_FILE = '.synapse-meta.json';
  const DEBOUNCE_MS = 1000;
  const pendingChanges = new Map();

  fileWatcher = chokidar.watch(path.join(syncDir, '**', '*'), {
    ignoreInitial: true,
    ignored: [
      META_FILE,
      '**/.synapse-backup',
      '**/.tmp-*',
      '**/node_modules/**',
      '**/.git/**',
    ],
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    followSymlinks: false,
  });

  async function flushChange(filePath) {
    const relative = path.relative(syncDir, filePath).replace(/\\/g, '/');
    const segments = relative.split('/');
    if (segments.length < 2) return;

    const projectSlug = segments[0];
    const themePath = segments.slice(1).join('/');
    if (themePath === META_FILE || themePath.startsWith('.')) return;

    const metaPath = path.join(syncDir, projectSlug, META_FILE);
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      return;
    }

    updateTrayStatus('syncing');

    try {
      const port = IS_DEV ? DEV_PORT : PROD_PORT;
      const base = `http://127.0.0.1:${port}`;

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        await fetch(`${base}/api/internal/sync-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: meta.projectId,
            filePath: themePath,
            content,
          }),
        });
        console.log(`[BackgroundSync] Synced: ${themePath}`);
      } else {
        console.log(`[BackgroundSync] Local delete detected (not synced): ${themePath}`);
      }
    } catch (err) {
      console.warn(`[BackgroundSync] Failed to sync ${themePath}:`, err.message);
      updateTrayStatus('error');
      return;
    }

    updateTrayStatus('idle');
  }

  function scheduleFlush(filePath) {
    const existing = pendingChanges.get(filePath);
    if (existing) clearTimeout(existing);
    pendingChanges.set(
      filePath,
      setTimeout(() => {
        pendingChanges.delete(filePath);
        flushChange(filePath).catch(() => {});
      }, DEBOUNCE_MS),
    );
  }

  fileWatcher.on('change', scheduleFlush);
  fileWatcher.on('add', scheduleFlush);
  fileWatcher.on('unlink', scheduleFlush);
  fileWatcher.on('error', (err) => {
    console.warn('[BackgroundSync] Watcher error:', err);
    updateTrayStatus('error');
  });

  console.log(`[BackgroundSync] Watching ${syncDir}`);
  updateTrayStatus('idle');
}

function stopBackgroundWatcher() {
  if (fileWatcher) {
    fileWatcher.close().catch(() => {});
    fileWatcher = null;
    console.log('[BackgroundSync] Stopped');
  }
}

/* ------------------------------------------------------------------ */
/*  IPC: Native folder import                                          */
/* ------------------------------------------------------------------ */

const THEME_DIRS = new Set([
  'assets', 'config', 'layout', 'locales',
  'sections', 'snippets', 'templates', 'blocks',
]);

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp4', 'webm', 'mp3',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__MACOSX', '.DS_Store',
]);

function readDirRecursive(dirPath, baseDir, maxFiles = 500) {
  const results = [];

  function walk(current) {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        const topDir = relativePath.split('/')[0];
        if (!THEME_DIRS.has(topDir)) continue;

        const ext = path.extname(entry.name).slice(1).toLowerCase();
        const isBinary = BINARY_EXTS.has(ext);

        try {
          const content = isBinary
            ? fs.readFileSync(fullPath).toString('base64')
            : fs.readFileSync(fullPath, 'utf-8');
          const sizeBytes = Buffer.byteLength(content, isBinary ? 'base64' : 'utf-8');

          if (sizeBytes <= 10 * 1024 * 1024) {
            results.push({ path: relativePath, content, sizeBytes });
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

function setupIPC() {
  ipcMain.handle('dialog:open-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Shopify Theme Folder',
      properties: ['openDirectory'],
      buttonLabel: 'Import',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('fs:read-theme-folder', async (_event, folderPath) => {
    if (typeof folderPath !== 'string') return { files: [], error: 'Invalid path' };
    try {
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        return { files: [], error: 'Path is not a directory' };
      }
      const files = readDirRecursive(folderPath, folderPath);
      if (files.length === 0) {
        return {
          files: [],
          error: 'No theme files found. Expected directories: assets/, config/, layout/, sections/, snippets/, templates/',
        };
      }
      return { files, error: null, folderName: path.basename(folderPath) };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:check-update', async () => {
    if (IS_DEV) return { available: false };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('fs:get-sync-path', () => {
    return path.join(process.cwd(), '.synapse-themes');
  });
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                      */
/* ------------------------------------------------------------------ */

app.setName(APP_NAME);

app.whenReady().then(async () => {
  createSplash();
  buildMenu();
  setupIPC();

  if (!IS_DEV) {
    await startNextServer();
  }

  const port = IS_DEV ? DEV_PORT : PROD_PORT;
  await waitForPort(port).catch(() => {
    console.error('Server did not start in time');
  });

  createMainWindow();
  createTray();
  setupAutoUpdater();
  startBackgroundWatcher();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  stopBackgroundWatcher();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});

if (!IS_DEV) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}
