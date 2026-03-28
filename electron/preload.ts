import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('save-settings', settings),

  // Dictionary
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  saveDictionary: (dictionary: Record<string, unknown>) => ipcRenderer.invoke('save-dictionary', dictionary),

  // Learned patterns
  getLearnedPatterns: () => ipcRenderer.invoke('get-learned-patterns'),
  saveLearnedPatterns: (patterns: Record<string, unknown>) => ipcRenderer.invoke('save-learned-patterns', patterns),

  // Paste to external window (from main app window)
  pasteToExternal: (text: string) => ipcRenderer.invoke('paste-to-external', text),

  // Auto-type text to active field (from hotkey flow, no window switching)
  autoTypeText: (text: string) => ipcRenderer.invoke('auto-type-text', text),

  // Hotkey
  updateHotkey: (hotkey: string) => ipcRenderer.invoke('update-hotkey', hotkey),

  // Utility
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  showSaveDialog: (options: Record<string, unknown>) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: Record<string, unknown>) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  // Hide the indicator overlay window
  hideIndicator: () => ipcRenderer.send('hide-indicator'),

  // Target window listener (foreground window tracking during recording)
  onTargetWindow: (callback: (title: string) => void) => {
    const handler = (_event: IpcRendererEvent, title: string) => callback(title)
    ipcRenderer.on('target-window', handler)
    return () => {
      ipcRenderer.removeListener('target-window', handler)
    }
  },

  // Recording command listener (from main process hotkey system)
  onRecordingCommand: (callback: (command: string, data?: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, command: string, data?: unknown) => callback(command, data)
    ipcRenderer.on('recording-command', handler)
    return () => {
      ipcRenderer.removeListener('recording-command', handler)
    }
  },

  // Auto-start on login
  setStartOnLogin: (enabled: boolean) => ipcRenderer.invoke('set-start-on-login', enabled),
  getStartOnLogin: () => ipcRenderer.invoke('get-start-on-login'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  onUpdateStatus: (callback: (status: string, info?: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, status: string, info?: unknown) => callback(status, info)
    ipcRenderer.on('update-status', handler)
    return () => {
      ipcRenderer.removeListener('update-status', handler)
    }
  },

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // External URL (for Stripe checkout, portal, etc.)
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),

  // OAuth callback listener (from custom protocol handler)
  onOAuthCallback: (callback: (url: string) => void) => {
    const handler = (_event: IpcRendererEvent, url: string) => callback(url)
    ipcRenderer.on('oauth-callback', handler)
    return () => {
      ipcRenderer.removeListener('oauth-callback', handler)
    }
  },
})
