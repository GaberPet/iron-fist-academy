// Narrow, explicit bridge between the renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ifaApi', {
  load: (key) => ipcRenderer.invoke('store:load', key),
  save: (key, value) => ipcRenderer.invoke('store:save', key, value),
  info: () => ipcRenderer.invoke('store:info'),
  exportFile: (name, text) => ipcRenderer.invoke('file:export', name, text),
  importFile: () => ipcRenderer.invoke('file:import'),
  openDataFolder: () => ipcRenderer.invoke('shell:openData'),
});
