const { app, BrowserWindow, globalShortcut, Notification, ipcMain } = require('electron');
const path = require('path');
const { startSyncServer, stopSyncServer, getSyncInfo, readSyncData, writeSyncData, readPin, resetPin } = require('./syncServer');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

let mainWindow = null;

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon.png')
    : path.join(process.resourcesPath, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Muse',
    icon: iconPath,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#2E3440',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Start the LAN sync server so phone can connect
  const distPath = isDev
    ? path.join(__dirname, '../public')  // In dev, serve public assets
    : path.join(__dirname, '../dist');     // In prod, serve built dist
  startSyncServer(distPath);
}

// IPC handlers for window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

// IPC handlers for sync
ipcMain.handle('sync-get-info', () => getSyncInfo());
ipcMain.handle('sync-read-data', () => readSyncData());
ipcMain.handle('sync-write-data', (_event, data) => {
  const ok = writeSyncData(data);
  return { ok };
});
ipcMain.handle('sync-get-pin', () => readPin());
ipcMain.handle('sync-reset-pin', () => resetPin());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopSyncServer();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
