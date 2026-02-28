const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isDesktop: true,

  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  readThemeFolder: (folderPath) => ipcRenderer.invoke('fs:read-theme-folder', folderPath),
  getSyncPath: () => ipcRenderer.invoke('fs:get-sync-path'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  startUpdateDownload: () => ipcRenderer.invoke('app:start-update-download'),
  restartToUpdate: () => ipcRenderer.invoke('app:restart-to-update'),

  preview: {
    navigate: (url) => ipcRenderer.invoke('preview:navigate', url),
    resize: (bounds) => ipcRenderer.invoke('preview:resize', bounds),
    destroy: () => ipcRenderer.invoke('preview:destroy'),
    refresh: () => ipcRenderer.invoke('preview:refresh'),
    setViewport: (width, height) => ipcRenderer.invoke('preview:set-viewport', width, height),
    getUrl: () => ipcRenderer.invoke('preview:get-url'),
  },

  send: (channel, ...args) => {
    const allowed = ['app:minimize', 'app:maximize', 'app:close', 'app:restart'];
    if (allowed.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  on: (channel, callback) => {
    const allowed = ['app:update-available', 'app:update-downloaded', 'menu:import-folder', 'preview:url-changed'];
    if (allowed.includes(channel)) {
      const handler = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
    return () => {};
  },
});
