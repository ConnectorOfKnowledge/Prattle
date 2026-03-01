import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

  // Platform prompts
  getPlatformPrompts: () => ipcRenderer.invoke('get-platform-prompts'),
  savePlatformPrompts: (prompts: any) => ipcRenderer.invoke('save-platform-prompts', prompts),

  // Dictionary
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  saveDictionary: (dictionary: any) => ipcRenderer.invoke('save-dictionary', dictionary),

  // Learned patterns
  getLearnedPatterns: () => ipcRenderer.invoke('get-learned-patterns'),
  saveLearnedPatterns: (patterns: any) => ipcRenderer.invoke('save-learned-patterns', patterns),

  // Tickets
  getTickets: () => ipcRenderer.invoke('get-tickets'),
  saveTickets: (tickets: any) => ipcRenderer.invoke('save-tickets', tickets),

  // Paste to external window
  pasteToExternal: (text: string) => ipcRenderer.invoke('paste-to-external', text),
  pasteFromOverlay: (text: string) => ipcRenderer.invoke('paste-from-overlay', text),

  // Hotkey / Overlay
  updateHotkey: (hotkey: string) => ipcRenderer.invoke('update-hotkey', hotkey),

  // Utility
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
})
