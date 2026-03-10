import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

  // Dictionary
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  saveDictionary: (dictionary: any) => ipcRenderer.invoke('save-dictionary', dictionary),

  // Learned patterns
  getLearnedPatterns: () => ipcRenderer.invoke('get-learned-patterns'),
  saveLearnedPatterns: (patterns: any) => ipcRenderer.invoke('save-learned-patterns', patterns),

  // Paste to external window (from main app window)
  pasteToExternal: (text: string) => ipcRenderer.invoke('paste-to-external', text),

  // Auto-type text to active field (from hotkey flow, no window switching)
  autoTypeText: (text: string) => ipcRenderer.invoke('auto-type-text', text),

  // Hotkey
  updateHotkey: (hotkey: string) => ipcRenderer.invoke('update-hotkey', hotkey),

  // Utility
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  // Hide the indicator overlay window
  hideIndicator: () => ipcRenderer.send('hide-indicator'),

  // Target window listener (foreground window tracking during recording)
  onTargetWindow: (callback: (title: string) => void) => {
    const handler = (_event: any, title: string) => callback(title)
    ipcRenderer.on('target-window', handler)
    return () => {
      ipcRenderer.removeListener('target-window', handler)
    }
  },

  // Recording command listener (from main process hotkey system)
  onRecordingCommand: (callback: (command: string, data?: any) => void) => {
    const handler = (_event: any, command: string, data?: any) => callback(command, data)
    ipcRenderer.on('recording-command', handler)
    // Return cleanup function
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
  onUpdateStatus: (callback: (status: string, info?: any) => void) => {
    const handler = (_event: any, status: string, info?: any) => callback(status, info)
    ipcRenderer.on('update-status', handler)
    return () => {
      ipcRenderer.removeListener('update-status', handler)
    }
  },

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // External URL (for Stripe checkout, portal, etc.)
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
})
