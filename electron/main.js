const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Load the app URL: set APP_URL for dev (e.g. http://localhost:3000) or use your deployed URL
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://synapse.so';

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Synapse',
    ...(fs.existsSync(iconPath) && { icon: iconPath }),
  });

  win.loadURL(APP_URL);

  // Open DevTools in development when APP_URL is localhost
  if (APP_URL.startsWith('http://localhost') && process.env.NODE_ENV !== 'production') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
