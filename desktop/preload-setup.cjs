const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopSetup', {
  getPlatformInfo: () => ipcRenderer.invoke('setup:get-platform-info'),
  runEnvCheck: () => ipcRenderer.invoke('setup:run-env-check'),
  installBundledMysql: () => ipcRenderer.invoke('setup:install-bundled-mysql'),
  startApplication: () => ipcRenderer.invoke('setup:start-application'),
  testConnection: (cfg) => ipcRenderer.invoke('setup:test-connection', cfg),
  applyAndStart: (cfg) => ipcRenderer.invoke('setup:apply-and-start', cfg),
  prepareExternalDb: (cfg) => ipcRenderer.invoke('setup:prepare-external-db', cfg),
  getBundledSqlStatus: () => ipcRenderer.invoke('setup:bundled-sql-status'),
  getLogoDataUrl: () => ipcRenderer.invoke('setup:get-logo-data-url'),
});
