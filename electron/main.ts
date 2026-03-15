import { app, BrowserWindow, ipcMain, dialog, clipboard, screen, Tray, Menu, nativeImage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { autoUpdater } from 'electron-updater'
import koffi from 'koffi'

const isDev = !app.isPackaged

// Set the app name so Task Manager shows "Prattle" instead of "Electron"
app.setName('Prattle')

// Register prattle:// as a custom protocol for OAuth callbacks.
// When Google redirects to prattle://auth/callback?code=..., the OS routes
// it to this app. We catch it and forward the URL to the renderer for
// session exchange.
if (process.defaultApp) {
  // In dev, we need to register with the path to electron
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('prattle', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('prattle')
}

// Store the OAuth callback URL if we receive it before the window is ready
let pendingOAuthUrl: string | null = null

// User data directory for settings, dictionary, learned patterns
const userDataPath = path.join(app.getPath('userData'), 'prattle-data')
const legacyDataPath = path.join(app.getPath('userData'), 'voicetype-data')

function ensureUserDataDir() {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  // Migrate legacy voicetype-data to prattle-data
  if (fs.existsSync(legacyDataPath)) {
    try {
      const files = fs.readdirSync(legacyDataPath)
      for (const file of files) {
        const src = path.join(legacyDataPath, file)
        const dest = path.join(userDataPath, file)
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
        }
      }
      console.log('[Prattle] Migrated data from voicetype-data to prattle-data')
    } catch (e) {
      console.error('[Prattle] Migration error:', e)
    }
  }
}

function getDataFilePath(filename: string): string {
  return path.join(userDataPath, filename)
}

function readJsonFile(filename: string, defaultValue: any = {}): any {
  const filePath = getDataFilePath(filename)
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error(`Error reading ${filename}:`, e)
  }
  return defaultValue
}

function writeJsonFile(filename: string, data: any): void {
  const filePath = getDataFilePath(filename)
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error(`Error writing ${filename}:`, e)
  }
}

let mainWindow: BrowserWindow | null = null
let indicatorWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let lastForegroundWindow: string = '' // Track foreground window title for text targeting

// ---- Native Ctrl+V simulation via koffi FFI ----
// Calls Win32 keybd_event directly from the Node.js process via koffi.
// No PowerShell spawning = no focus stealing = works with Chrome.
const user32 = koffi.load('user32.dll')
const keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, void* dwExtraInfo)')

const VK_CONTROL = 0x11
const VK_V = 0x56
const KEYEVENTF_KEYUP = 0x0002

function simulateCtrlV(): Promise<void> {
  return new Promise((resolve) => {
    // Ctrl down + V down (synchronous, no focus loss)
    keybd_event(VK_CONTROL, 0, 0, null)
    keybd_event(VK_V, 0, 0, null)

    // Brief hold so Chrome's event loop registers the keystroke
    setTimeout(() => {
      keybd_event(VK_V, 0, KEYEVENTF_KEYUP, null)
      keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, null)
      resolve()
    }, 50)
  })
}

// ---- Hotkey state tracking ----
let ctrlDown = false
let shiftDown = false
let altDown = false
let triggerKeyDown = false
let lastTriggerPressTime = 0
let isHoldRecording = false
let isHandsFreeMode = false
let hasLastCommittedText = false // Track if there's text available for rewrite
let stopDelayTimeout: ReturnType<typeof setTimeout> | null = null // Delayed stop for double-tap detection

const DOUBLE_TAP_WINDOW = 400 // ms — window between keydown events for double-tap detection
const STOP_DELAY = 250 // ms — delay before processing on keyup (allows double-tap cancel)

// ---- Foreground window tracking ----
// Detect the active window title so the user knows where text will be pasted.
// Returns the window title of the foreground app, or empty string on failure.
function getForegroundWindowTitle(): Promise<string> {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "(Get-Process | Where-Object {$_.MainWindowHandle -eq (Add-Type -MemberDefinition \'[DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow();\' -Name W -Namespace W -PassThru)::GetForegroundWindow()}).MainWindowTitle"',
      { timeout: 2000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve('')
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

// Periodically track foreground window when recording (so indicator shows target)
let foregroundTrackingInterval: ReturnType<typeof setInterval> | null = null

function startForegroundTracking() {
  if (foregroundTrackingInterval) return
  // Immediately capture the current foreground window
  getForegroundWindowTitle().then(title => {
    if (title && !title.includes('Prattle')) {
      lastForegroundWindow = title
      sendToIndicator('target-window', title)
      sendToRenderer('target-window', title)
    }
  })
  foregroundTrackingInterval = setInterval(async () => {
    const title = await getForegroundWindowTitle()
    if (title && !title.includes('Prattle') && title !== lastForegroundWindow) {
      lastForegroundWindow = title
      sendToIndicator('target-window', title)
      sendToRenderer('target-window', title)
    }
  }, 1000)
}

function stopForegroundTracking() {
  if (foregroundTrackingInterval) {
    clearInterval(foregroundTrackingInterval)
    foregroundTrackingInterval = null
  }
}

// ---- Configurable hotkey system ----
// Map friendly key names to uiohook keycodes
const KEY_NAME_TO_KEYCODE: Record<string, number> = {
  'Space': UiohookKey.Space,
  'Insert': UiohookKey.Insert,
  'Delete': UiohookKey.Delete,
  'Home': UiohookKey.Home,
  'End': UiohookKey.End,
  'PageUp': UiohookKey.PageUp,
  'PageDown': UiohookKey.PageDown,
  'Pause': 0xE046, // Pause/Break key (not in UiohookKey enum)
  'ScrollLock': UiohookKey.ScrollLock,
  'PrintScreen': UiohookKey.PrintScreen,
  'F1': UiohookKey.F1,
  'F2': UiohookKey.F2,
  'F3': UiohookKey.F3,
  'F4': UiohookKey.F4,
  'F5': UiohookKey.F5,
  'F6': UiohookKey.F6,
  'F7': UiohookKey.F7,
  'F8': UiohookKey.F8,
  'F9': UiohookKey.F9,
  'F10': UiohookKey.F10,
  'F11': UiohookKey.F11,
  'F12': UiohookKey.F12,
  'RightAlt': UiohookKey.AltRight,
  'RightCtrl': UiohookKey.CtrlRight,
  'RightShift': UiohookKey.ShiftRight,
}

interface HotkeyConfig {
  requireCtrl: boolean
  requireShift: boolean
  requireAlt: boolean
  triggerKeycode: number
}

let activeHotkey: HotkeyConfig = {
  requireCtrl: false,
  requireShift: false,
  requireAlt: false,
  triggerKeycode: UiohookKey.AltRight, // Default: Right Alt
}

function parseHotkeyString(hotkey: string): HotkeyConfig {
  const parts = hotkey.split('+').map(p => p.trim())
  const config: HotkeyConfig = {
    requireCtrl: false,
    requireShift: false,
    requireAlt: false,
    triggerKeycode: UiohookKey.AltRight,
  }

  // Last part is the trigger key, everything before is modifiers
  const triggerName = parts.pop() || 'RightAlt'
  for (const mod of parts) {
    const lower = mod.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') config.requireCtrl = true
    else if (lower === 'shift') config.requireShift = true
    else if (lower === 'alt') config.requireAlt = true
  }

  // Look up the trigger keycode
  config.triggerKeycode = KEY_NAME_TO_KEYCODE[triggerName] ?? UiohookKey.AltRight

  return config
}

function modifiersMatch(): boolean {
  if (activeHotkey.requireCtrl && !ctrlDown) return false
  if (activeHotkey.requireShift && !shiftDown) return false
  if (activeHotkey.requireAlt && !altDown) return false
  return true
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 450,
    minWidth: 500,
    minHeight: 300,
    title: 'Prattle',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: '#0D0D1A',
    titleBarStyle: 'default',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Close button hides to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createIndicatorWindow() {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW } = primaryDisplay.workAreaSize
  const indicatorW = 420
  const indicatorH = 100

  indicatorWindow = new BrowserWindow({
    width: indicatorW,
    height: indicatorH,
    x: Math.round((screenW - indicatorW) / 2),
    y: 20,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    transparent: true,
    show: false, // Start hidden — pre-created on app launch
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    indicatorWindow.loadURL('http://localhost:5173/?indicator=true')
  } else {
    indicatorWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { indicator: 'true' }
    })
  }

  indicatorWindow.on('closed', () => {
    indicatorWindow = null
  })
}

function showIndicator() {
  if (!indicatorWindow || indicatorWindow.isDestroyed()) {
    createIndicatorWindow()
    // If we had to create it, wait for it to load before showing
    indicatorWindow?.once('ready-to-show', () => {
      indicatorWindow?.show()
    })
  } else {
    indicatorWindow.show()
  }
}

function hideIndicator() {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    // Tell the indicator component to reset its state before hiding
    indicatorWindow.webContents.send('recording-command', 'done')
    indicatorWindow.hide()
  }
}

function sendToRenderer(channel: string, ...args: any[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function sendToIndicator(channel: string, ...args: any[]) {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    indicatorWindow.webContents.send(channel, ...args)
  }
}

// ---- uiohook-napi hotkey system ----
// Behavior:
//   HOLD the hotkey     → record while held, process + auto-type on release
//   DOUBLE-TAP          → toggle hands-free mode (continuous recording)
//   TAP during hands-free → stop recording and auto-type the result
function setupHotkeySystem() {
  // Load hotkey from settings
  const settings = readJsonFile('settings.json')
  const hotkeyStr = settings.hotkey || 'RightAlt'
  activeHotkey = parseHotkeyString(hotkeyStr)
  console.log(`[Prattle] Hotkey set to: ${hotkeyStr} (keycode ${activeHotkey.triggerKeycode})`)

  // Log first few key events for diagnostics
  let keyEventCount = 0

  uIOhook.on('keydown', (e) => {
    // Log first 5 key events to confirm uiohook is receiving input
    if (keyEventCount < 5) {
      keyEventCount++
      console.log(`[Prattle] Key event #${keyEventCount}: keycode=${e.keycode} (trigger=${activeHotkey.triggerKeycode})`)
    }

    // Track modifier states (always, regardless of hotkey config)
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = true
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = true
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = true

    // Check if trigger key pressed
    if (e.keycode === activeHotkey.triggerKeycode) {
      if (triggerKeyDown) return // Already down, ignore repeat
      triggerKeyDown = true

      // Check if required modifiers are held
      if (!modifiersMatch()) return

      const now = Date.now()
      const timeSinceLastPress = now - lastTriggerPressTime
      lastTriggerPressTime = now

      if (timeSinceLastPress < DOUBLE_TAP_WINDOW) {
        // Double-tap detected: cancel any pending stop from the first tap's release
        if (stopDelayTimeout) {
          clearTimeout(stopDelayTimeout)
          stopDelayTimeout = null
        }

        // Toggle hands-free mode
        if (isHandsFreeMode) {
          // Stop hands-free recording
          isHandsFreeMode = false
          isHoldRecording = false
          stopForegroundTracking()
          sendToRenderer('recording-command', 'stop')
          sendToIndicator('recording-command', 'stop')
        } else {
          // Start hands-free recording
          // Recording is already active from the first tap — just switch to hands-free mode
          isHandsFreeMode = true
          isHoldRecording = false
          showIndicator()
          sendToIndicator('recording-command', 'start-handsfree')
          // Don't send start-handsfree to renderer — recording is already running
        }
      } else if (!isHandsFreeMode) {
        // Single press: start hold-to-record
        isHoldRecording = true
        startForegroundTracking()

        // Check if we should enter rewrite mode
        if (hasLastCommittedText) {
          sendToRenderer('recording-command', 'start-rewrite')
          showIndicator()
          sendToIndicator('recording-command', 'start-rewrite')
        } else {
          sendToRenderer('recording-command', 'start')
          showIndicator()
          sendToIndicator('recording-command', 'start')
        }
      }
    }
  })

  uIOhook.on('keyup', (e) => {
    // Track modifier states
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = false
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = false
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = false

    // Check if trigger key released
    if (e.keycode === activeHotkey.triggerKeycode) {
      triggerKeyDown = false

      if (isHoldRecording && !isHandsFreeMode) {
        // Delay the stop to allow double-tap detection — if a second keydown
        // comes within DOUBLE_TAP_WINDOW, this timeout gets cancelled and
        // we switch to hands-free mode instead of processing a ghost recording
        stopDelayTimeout = setTimeout(() => {
          stopDelayTimeout = null
          if (isHoldRecording && !isHandsFreeMode) {
            isHoldRecording = false
            stopForegroundTracking()
            sendToRenderer('recording-command', 'stop')
            sendToIndicator('recording-command', 'stop')
          }
        }, STOP_DELAY)
      }
      // If in hands-free mode, keyup is ignored (recording continues until next tap)
    }
  })

  try {
    uIOhook.start()
    console.log('[Prattle] uIOhook started successfully — global hotkey active')
  } catch (err) {
    console.error('[Prattle] FAILED to start uIOhook:', err)
    // Notify the renderer so the user knows
    setTimeout(() => {
      sendToRenderer('update-status', 'error',
        'Global hotkey failed to initialize. Try running Prattle as administrator.')
    }, 3000)
  }
}

function createTray() {
  // Load icon from build directory or use a fallback
  const iconPath = isDev
    ? path.join(__dirname, '../build/icon.png')
    : path.join(process.resourcesPath, 'build', 'icon.png')

  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    // Resize for tray (16x16 on Windows)
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  } catch {
    // Fallback: create a simple colored square if icon not found
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Prattle — Voice to Text')

  const settings = readJsonFile('settings.json')
  const startOnLogin = settings.startOnLogin !== false // default true

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Prattle',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start on Login',
      type: 'checkbox',
      checked: startOnLogin,
      click: (menuItem) => {
        const enabled = menuItem.checked
        app.setLoginItemSettings({ openAtLogin: enabled })
        const s = readJsonFile('settings.json')
        s.startOnLogin = enabled
        writeJsonFile('settings.json', s)
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Prattle',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Double-click tray icon → show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

function setupAutoUpdater() {
  // Don't check for updates in dev mode
  if (isDev) {
    console.log('[Prattle] Dev mode — skipping auto-updater')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update-status', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update-status', 'available', info)
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-status', 'up-to-date')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update-status', 'downloading', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update-status', 'ready', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Prattle] Update error:', err)
    sendToRenderer('update-status', 'error', err.message)
  })

  // Check for updates on startup (after a short delay)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify()
  }, 5000)
}

// ---- Single-instance lock ----
// Prevent multiple Prattle processes from running simultaneously.
// Duplicate instances create conflicting hotkey listeners and cause erratic behavior.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running — quit immediately
  console.log('[Prattle] Another instance is already running. Focusing existing window.')
  app.quit()
} else {
  // When a second instance tries to launch, focus the existing window instead.
  // On Windows, protocol URLs (prattle://...) arrive here as argv in the second instance.
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }

    // Check if the second instance was launched with a prattle:// URL (OAuth callback)
    const oauthUrl = argv.find(arg => arg.startsWith('prattle://'))
    if (oauthUrl) {
      handleOAuthCallback(oauthUrl)
    }
  })
}

// Handle OAuth callback URL from custom protocol
function handleOAuthCallback(url: string) {
  console.log('[Prattle] OAuth callback received:', url.substring(0, 80) + '...')
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('oauth-callback', url)
    mainWindow.show()
    mainWindow.focus()
  } else {
    // Window not ready yet -- store for later
    pendingOAuthUrl = url
  }
}

// On macOS, protocol URLs arrive via open-url event (not second-instance)
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('prattle://')) {
    handleOAuthCallback(url)
  }
})

app.whenReady().then(() => {
  ensureUserDataDir()
  initializeDefaultData()

  // Check if launched with --hidden flag (auto-start)
  const startHidden = process.argv.includes('--hidden')

  createWindow()

  if (startHidden) {
    mainWindow?.hide()
  }

  // If we received an OAuth callback before the window was ready, send it now
  if (pendingOAuthUrl && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      if (pendingOAuthUrl) {
        sendToRenderer('oauth-callback', pendingOAuthUrl)
        pendingOAuthUrl = null
      }
    })
  }

  createIndicatorWindow() // Pre-create so it's ready when hotkey fires
  createTray()

  // Defer uIOhook startup — the native hook can block the event loop
  // and cause the app/installer to appear unresponsive during launch
  setTimeout(() => setupHotkeySystem(), 500)
  setupAutoUpdater()

  // Apply auto-start setting
  const settings = readJsonFile('settings.json')
  if (settings.startOnLogin !== false) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden'] // Start minimized to tray
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Don't quit — tray keeps the app alive
  // Only quit when isQuitting is true (from tray "Quit" or app.quit())
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  try { uIOhook.stop() } catch (_) {}
})

// Initialize default data files if they don't exist
function initializeDefaultData() {
  // Default settings
  if (!fs.existsSync(getDataFilePath('settings.json'))) {
    writeJsonFile('settings.json', {
      speechProvider: 'deepgram',
      llmProvider: 'claude',
      apiKeys: {},
      currentModeIndex: 0,
      customPrompts: {},
      fontSize: 16,
      theme: 'dark',
      micGain: 100,
      hotkey: 'RightAlt',
      startOnLogin: true,
    })
  } else {
    // Migrate existing settings to new format
    const settings = readJsonFile('settings.json')
    let changed = false

    // Remove old fields
    if ('activePlatform' in settings) {
      delete settings.activePlatform
      changed = true
    }
    if ('autoProcess' in settings) {
      delete settings.autoProcess
      changed = true
    }
    if ('globalRules' in settings) {
      delete settings.globalRules
      changed = true
    }
    if ('learningMode' in settings) {
      delete settings.learningMode
      changed = true
    }

    // Add new fields
    if (settings.currentModeIndex === undefined) {
      settings.currentModeIndex = 0
      changed = true
    }
    if (settings.customPrompts === undefined) {
      settings.customPrompts = {}
      changed = true
    }
    if (settings.hotkey === undefined || settings.hotkey === 'Ctrl+Shift+Space') {
      settings.hotkey = 'RightAlt'
      changed = true
    }
    if (settings.micGain === undefined) {
      settings.micGain = 100
      changed = true
    }
    if (settings.startOnLogin === undefined) {
      settings.startOnLogin = true
      changed = true
    }

    if (changed) writeJsonFile('settings.json', settings)
  }

  // Default dictionary
  if (!fs.existsSync(getDataFilePath('dictionary.json'))) {
    writeJsonFile('dictionary.json', {
      replacements: {},
    })
  }

  // Default learned patterns
  if (!fs.existsSync(getDataFilePath('learned-patterns.json'))) {
    writeJsonFile('learned-patterns.json', {
      patterns: [],
    })
  }
}

// ---- IPC Handlers ----

// Settings
ipcMain.handle('get-settings', () => readJsonFile('settings.json'))
ipcMain.handle('save-settings', (_, settings) => {
  writeJsonFile('settings.json', settings)
  return true
})

// Dictionary
ipcMain.handle('get-dictionary', () => readJsonFile('dictionary.json'))
ipcMain.handle('save-dictionary', (_, dictionary) => {
  writeJsonFile('dictionary.json', dictionary)
  return true
})

// Learned patterns
ipcMain.handle('get-learned-patterns', () => readJsonFile('learned-patterns.json'))
ipcMain.handle('save-learned-patterns', (_, patterns) => {
  writeJsonFile('learned-patterns.json', patterns)
  return true
})

// Get user data path (for display in settings)
ipcMain.handle('get-user-data-path', () => userDataPath)

// Paste to external window (from main window -- minimizes Prattle)
ipcMain.handle('paste-to-external', async (_, text: string) => {
  if (!mainWindow) return false

  try {
    // 1. Copy text to clipboard
    clipboard.writeText(text)

    // 2. Minimize Prattle so previous window regains focus
    mainWindow.minimize()

    // 3. Wait for focus to shift (500ms gives the OS time to activate the previous window)
    await new Promise(resolve => setTimeout(resolve, 500))

    // 4. Simulate Ctrl+V via Win32 keybd_event (hardware-level, works with Chrome)
    await simulateCtrlV()

    // 5. Brief delay then restore
    await new Promise(resolve => setTimeout(resolve, 400))
    mainWindow.restore()
    mainWindow.focus()

    return true
  } catch (error) {
    console.error('Paste to external failed:', error)
    // Restore window even on failure
    if (mainWindow) {
      mainWindow.restore()
      mainWindow.focus()
    }
    return false
  }
})

// Auto-type text to active field (from hotkey flow -- does NOT minimize/restore)
// Uses Win32 keybd_event for hardware-level key simulation (works with Chrome, Electron apps, etc.)
ipcMain.handle('auto-type-text', async (_, text: string) => {
  try {
    // 1. Copy text to clipboard
    clipboard.writeText(text)

    // 2. Wait for clipboard to settle and OS focus to stabilize
    await new Promise(resolve => setTimeout(resolve, 200))

    // 3. Simulate Ctrl+V via Win32 keybd_event
    await simulateCtrlV()

    return true
  } catch (error) {
    console.error('Auto-type failed:', error)
    return false
  }
})

// Track whether there's committed text (for rewrite mode detection)
ipcMain.on('has-committed-text', (_, hasText: boolean) => {
  hasLastCommittedText = hasText
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
  isQuitting = true
  // Stop the native keyboard hook before restarting — it holds a thread
  // that can block the quit/restart cycle
  try { uIOhook.stop() } catch (_) {}
  autoUpdater.quitAndInstall(false, true) // isSilent=false, isForceRunAfter=true
})

// App version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Open external URL (for Stripe checkout, portal, etc.)
ipcMain.handle('open-external-url', (_, url: string) => {
  const { shell } = require('electron')
  shell.openExternal(url)
  return true
})

// Update hotkey — re-parse the new hotkey string so it takes effect immediately
ipcMain.handle('update-hotkey', (_, hotkey: string) => {
  activeHotkey = parseHotkeyString(hotkey)
  // Reset state to avoid stuck keys
  triggerKeyDown = false
  isHoldRecording = false
  isHandsFreeMode = false
  console.log(`[Prattle] Hotkey updated to: ${hotkey} (keycode ${activeHotkey.triggerKeycode})`)
  return true
})

// File dialog for export/import
ipcMain.handle('show-save-dialog', async (_, options) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

ipcMain.handle('show-open-dialog', async (_, options) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result
})

ipcMain.handle('write-file', (_, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('read-file', (_, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})
