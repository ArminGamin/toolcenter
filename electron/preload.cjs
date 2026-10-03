/** Durable settings snapshot (src/lib/settings-cache.ts) and manual updates (UpdateButton). */
const { contextBridge, ipcRenderer } = require('electron')

let snapshot = {}
try {
  snapshot = ipcRenderer.sendSync('cc-settings:load') || {}
} catch {
  snapshot = {}
}

contextBridge.exposeInMainWorld('ccDesktop', {
  updateStatus: () => ipcRenderer.invoke('cc-update:status'),
  applyUpdate: () => ipcRenderer.invoke('cc-update:apply'),
})

contextBridge.exposeInMainWorld('ccSettingsCache', {
  snapshot,
  save: (values) => ipcRenderer.send('cc-settings:save', values),
})
