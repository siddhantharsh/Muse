const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  sendNotification: (title, body) => {
    new Notification(title, { body });
  },
  // Sync API
  syncGetInfo: () => ipcRenderer.invoke('sync-get-info'),
  syncReadData: () => ipcRenderer.invoke('sync-read-data'),
  syncWriteData: (data) => ipcRenderer.invoke('sync-write-data', data),
  syncGetPin: () => ipcRenderer.invoke('sync-get-pin'),
  syncResetPin: () => ipcRenderer.invoke('sync-reset-pin'),
});
