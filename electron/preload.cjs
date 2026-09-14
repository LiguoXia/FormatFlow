const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  onWindowState: (callback) => { const listener = (_event, state) => callback(state); ipcRenderer.on('window:state', listener); return () => ipcRenderer.removeListener('window:state', listener); },
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text)
});
