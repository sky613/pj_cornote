const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cornoteDesktop', {
  saveBackup: (filename, contents) => ipcRenderer.invoke('save-backup', filename, contents),
})
