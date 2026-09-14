const { app, BrowserWindow, ipcMain, Menu, clipboard, session } = require('electron');
const path = require('node:path');
let mainWindow;
const devUrl = !app.isPackaged && process.env.FORMATFLOW_DEV_URL;
const validSender = (event) => event.sender === mainWindow?.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 940, minHeight: 640,
    title: 'FormatFlow', backgroundColor: '#f7f8fa', frame: false, show: false,
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  const emitState = () => mainWindow?.webContents.send('window:state', { maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() });
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(event, emitState);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (devUrl) mainWindow.loadURL(devUrl); else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const allowed = details.url.startsWith('file:') || details.url.startsWith('devtools:') || (devUrl && (details.url.startsWith(devUrl + '/') || details.url.startsWith('ws://127.0.0.1:5173/')));
      callback({ cancel: !allowed });
    });
    ipcMain.handle('window:action', (event, action) => {
      if (!validSender(event)) return;
      if (action === 'minimize') mainWindow.minimize();
      if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      if (action === 'fullscreen') mainWindow.setFullScreen(!mainWindow.isFullScreen());
      if (action === 'exit-fullscreen') mainWindow.setFullScreen(false);
      if (action === 'close') mainWindow.close();
    });
    ipcMain.handle('window:state', (event) => validSender(event) ? ({ maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() }) : null);
    ipcMain.handle('clipboard:read', (event) => validSender(event) ? clipboard.readText() : '');
    ipcMain.handle('clipboard:write', (event, text) => { if (validSender(event) && typeof text === 'string') clipboard.writeText(text); });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
