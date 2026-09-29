const { contextBridge, ipcRenderer } = require('electron');
const request = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  onWindowState: (callback) => { const listener = (_event, state) => callback(state); ipcRenderer.on('window:state', listener); return () => ipcRenderer.removeListener('window:state', listener); },
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  custom: {
    list: () => request('custom:list'), environment: () => request('custom:environment'),
    save: (record) => ipcRenderer.invoke('custom:save', record),
    run: (record, text) => ipcRenderer.invoke('custom:run', record, text),
    remove: (id) => request('custom:remove', id), cancel: () => request('custom:cancel'),
    openFolder: () => request('custom:folder'), export: () => request('custom:export'), import: () => request('custom:import')
  },
  settings: { read: () => request('settings:read'), write: (patch) => request('settings:write', patch) }
});
