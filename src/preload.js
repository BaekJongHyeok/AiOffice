const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiOffice', {
  openSubscription: (provider, prompt = '', modelProfile = 'auto') => ipcRenderer.invoke('open-subscription', { provider, prompt, modelProfile }),
  automateSubscription: (provider, prompt = '', modelProfile = 'auto') => ipcRenderer.invoke('automate-subscription', { provider, prompt, modelProfile }),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  getSessionInfo: (provider) => ipcRenderer.invoke('session-info', provider),
  clearSubscriptionSession: (provider) => ipcRenderer.invoke('clear-subscription-session', provider),
  runUpdater: () => ipcRenderer.invoke('run-updater'),
});
