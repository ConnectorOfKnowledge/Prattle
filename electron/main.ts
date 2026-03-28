import { app, BrowserWindow } from 'electron'
import path from 'path'
import { ensureUserDataDir, initializeDefaultData, readJsonFile } from './dataStore'
import { stopPersistentPowerShell } from './foregroundTracker'
import { setupHotkeySystem, stopHotkeySystem } from './hotkeySystem'
import { createWindow, createIndicatorWindow, sendToRenderer, showIndicator, sendToIndicator, getMainWindow } from './windowManager'
import { createTray } from './trayManager'
import { setupAutoUpdater } from './autoUpdater'
import { registerIpcHandlers } from './ipcHandlers'

// Set the app name so Task Manager shows "Prattle" instead of "Electron"
app.setName('Prattle')

// Shared mutable flag for quit state, passed by reference to modules
const isQuittingRef = { value: false }

// Store the OAuth callback URL if we receive it before the window is ready
let pendingOAuthUrl: string | null = null

// Register prattle:// as a custom protocol for OAuth callbacks.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('prattle', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('prattle')
}

// Handle OAuth callback URL from custom protocol
function handleOAuthCallback(url: string) {
  console.log('[Prattle] OAuth callback received:', url.substring(0, 80) + '...')
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('oauth-callback', url)
    mainWindow.show()
    mainWindow.focus()
  } else {
    pendingOAuthUrl = url
  }
}

// ---- Single-instance lock ----
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('[Prattle] Another instance is already running. Focusing existing window.')
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }

    const oauthUrl = argv.find(arg => arg.startsWith('prattle://'))
    if (oauthUrl) {
      handleOAuthCallback(oauthUrl)
    }
  })
}

// On macOS, protocol URLs arrive via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('prattle://')) {
    handleOAuthCallback(url)
  }
})

app.whenReady().then(() => {
  ensureUserDataDir()
  initializeDefaultData()

  // Register all IPC handlers before creating windows
  registerIpcHandlers(isQuittingRef)

  const startHidden = process.argv.includes('--hidden')

  createWindow(isQuittingRef)

  if (startHidden) {
    getMainWindow()?.hide()
  }

  // If we received an OAuth callback before the window was ready, send it now
  const mainWindow = getMainWindow()
  if (pendingOAuthUrl && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      if (pendingOAuthUrl) {
        sendToRenderer('oauth-callback', pendingOAuthUrl)
        pendingOAuthUrl = null
      }
    })
  }

  createIndicatorWindow()
  createTray(isQuittingRef)

  // Defer uIOhook startup to avoid blocking the event loop during launch
  setTimeout(() => setupHotkeySystem({
    sendToRenderer,
    sendToIndicator,
    showIndicator,
  }), 500)

  setupAutoUpdater()

  // Apply auto-start setting
  const settings = readJsonFile('settings.json')
  if (settings.startOnLogin !== false) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden']
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(isQuittingRef)
  })
})

app.on('window-all-closed', () => {
  // Don't quit -- tray keeps the app alive
})

app.on('before-quit', () => {
  isQuittingRef.value = true
})

app.on('will-quit', () => {
  stopHotkeySystem()
  stopPersistentPowerShell()
})
