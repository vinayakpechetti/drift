const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('driftCursor', {
  onMove(callback) {
    const listener = (_event, point) => callback(point);
    ipcRenderer.on('cursor-position', listener);
    return () => ipcRenderer.removeListener('cursor-position', listener);
  }
});
