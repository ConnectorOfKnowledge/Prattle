import { ipcMain, dialog, clipboard, shell, app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { uIOhook } from 'uiohook-napi'
import { readJsonFile, writeJsonFile, userDataPath, isPathSafe } from './dataStore'
import { getMainWindow, sendToRenderer, hideIndicator } from './windowManager'
import { updateHotkey } from './hotkeySystem'

const isDev = !app.isPackaged

// Path to the pre-compiled C++ helper that simulates Ctrl+V via Win32 SendInput
const pasteHelperPath = isDev
  ? path.join(__dirname, '../../resources/paste_helper.exe')
  : path.join(process.resourcesPath, 'paste_helper.exe')

export function registerIpcHandlers(isQuittingRef: { value: boolean }): void {
  // Settings
  ipcMain.handle('get-settings', () => readJsonFile('settings.json'))
  ipcMain.handle('save-settings', (_, settings: Record<string, unknown>) => {
    writeJsonFile('settings.json', settings)
    return true
  })

  // Dictionary
  ipcMain.handle('get-dictionary', () => readJsonFile('dictionary.json'))
  ipcMain.handle('save-dictionary', (_, dictionary: Record<string, unknown>) => {
    writeJsonFile('dictionary.json', dictionary)
    return true
  })

  // Learned patterns
  ipcMain.handle('get-learned-patterns', () => readJsonFile('learned-patterns.json'))
  ipcMain.handle('save-learned-patterns', (_, patterns: Record<string, unknown>) => {
    writeJsonFile('learned-patterns.json', patterns)
    return true
  })

  // Get user data path (for display in settings)
  ipcMain.handle('get-user-data-path', () => userDataPath)

  // Paste to external window (from main window -- minimizes Prattle)
  ipcMain.handle('paste-to-external', async (_, text: string) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return false

    try {
      clipboard.writeText(text)
      clipboard.readText()

      mainWindow.minimize()
      await new Promise(resolve => setTimeout(resolve, 500))

      await new Promise<void>((resolve, reject) => {
        execFile(pasteHelperPath, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })

      await new Promise(resolve => setTimeout(resolve, 400))
      mainWindow.restore()
      mainWindow.focus()

      return true
    } catch (error) {
      console.error('[Prattle] Paste to external failed:', error)
      const win = getMainWindow()
      if (win) {
        win.restore()
        win.focus()
      }
      return false
    }
  })

  // Auto-type text to active field (from hotkey flow -- does NOT minimize/restore)
  ipcMain.handle('auto-type-text', async (_, text: string) => {
    try {
      clipboard.writeText(text)
      clipboard.readText()

      await new Promise(resolve => setTimeout(resolve, 50))

      await new Promise<void>((resolve, reject) => {
        execFile(pasteHelperPath, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })

      return true
    } catch (error) {
      console.error('[Prattle] Auto-type failed:', error)
      return false
    }
  })

  // Indicator visibility control from renderer
  ipcMain.on('hide-indicator', () => {
    hideIndicator()
  })

  // Auto-start on login
  ipcMain.handle('set-start-on-login', (_, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: enabled ? ['--hidden'] : []
    })
    return true
  })

  ipcMain.handle('get-start-on-login', () => {
    const loginSettings = app.getLoginItemSettings()
    return loginSettings.openAtLogin
  })

  // Auto-updater
  ipcMain.on('check-for-updates', () => {
    if (isDev) {
      sendToRenderer('update-status', 'dev-mode')
      return
    }
    autoUpdater.checkForUpdatesAndNotify()
  })

  ipcMain.on('restart-to-update', () => {
    isQuittingRef.value = true
    try { uIOhook.stop() } catch (_) { /* may not be running */ }
    autoUpdater.quitAndInstall(false, true)
  })

  // App version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Open external URL (for Stripe checkout, portal, etc.)
  // SECURITY: Only allow https:// URLs to prevent arbitrary protocol execution
  ipcMain.handle('open-external-url', (_, url: string) => {
    if (!url.startsWith('https://')) {
      console.error('[Prattle] Blocked non-HTTPS external URL:', url)
      return false
    }
    shell.openExternal(url)
    return true
  })

  // Update hotkey
  ipcMain.handle('update-hotkey', (_, hotkey: string) => {
    updateHotkey(hotkey)
    return true
  })

  // History (max 100 entries, stored in history.json)
  const HISTORY_MAX = 100
  ipcMain.handle('get-history', () => {
    const data = readJsonFile('history.json', { entries: [] })
    return (data.entries as unknown[]) || []
  })
  ipcMain.handle('add-history-entry', (_, entry: Record<string, unknown>) => {
    const data = readJsonFile('history.json', { entries: [] })
    const entries = ((data.entries as unknown[]) || []) as Record<string, unknown>[]
    entries.unshift(entry) // newest first
    if (entries.length > HISTORY_MAX) entries.length = HISTORY_MAX
    writeJsonFile('history.json', { entries })
    return true
  })
  ipcMain.handle('clear-history', () => {
    writeJsonFile('history.json', { entries: [] })
    return true
  })

  // File dialog for export/import
  ipcMain.handle('show-save-dialog', async (_, options: Electron.SaveDialogOptions) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, options)
    return result
  })

  ipcMain.handle('show-open-dialog', async (_, options: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, options)
    return result
  })

  // SECURITY: File read/write restricted to userDataPath only
  ipcMain.handle('write-file', (_, filePath: string, content: string) => {
    try {
      if (!isPathSafe(filePath)) {
        console.error('[Prattle] Blocked write to unsafe path:', filePath)
        return { error: 'Path is outside the allowed data directory' }
      }
      fs.writeFileSync(filePath, content, 'utf-8')
      return true
    } catch (error) {
      console.error('[Prattle] Failed to write file:', error)
      return { error: `Failed to write file: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('read-file', (_, filePath: string) => {
    try {
      if (!isPathSafe(filePath)) {
        console.error('[Prattle] Blocked read from unsafe path:', filePath)
        return { error: 'Path is outside the allowed data directory' }
      }
      return fs.readFileSync(filePath, 'utf-8')
    } catch (error) {
      console.error('[Prattle] Failed to read file:', error)
      return { error: `Failed to read file: ${(error as Error).message}` }
    }
  })
}
