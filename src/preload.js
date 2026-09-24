const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiOffice', {
  openSubscription: (provider, prompt = '') => ipcRenderer.invoke('open-subscription', { provider, prompt }),
  automateSubscription: (provider, prompt = '') => ipcRenderer.invoke('automate-subscription', { provider, prompt }),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  getSessionInfo: (provider) => ipcRenderer.invoke('session-info', provider),
  clearSubscriptionSession: (provider) => ipcRenderer.invoke('clear-subscription-session', provider),
  runUpdater: () => ipcRenderer.invoke('run-updater'),
});
