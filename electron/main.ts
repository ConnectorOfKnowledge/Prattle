import { app, BrowserWindow, ipcMain, dialog, clipboard, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'

const isDev = !app.isPackaged

// User data directory for settings, dictionary, learned patterns
const userDataPath = path.join(app.getPath('userData'), 'voicetype-data')

function ensureUserDataDir() {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
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

// ---- Hotkey state tracking ----
let ctrlDown = false
let shiftDown = false
let altDown = false
let triggerKeyDown = false
let lastTriggerPressTime = 0
let isHoldRecording = false
let isHandsFreeMode = false
let hasLastCommittedText = false // Track if there's text available for rewrite

const DOUBLE_TAP_WINDOW = 400 // ms

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
  'Pause': UiohookKey.Pause,
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
    width: 1000,
    height: 800,
    minWidth: 750,
    minHeight: 600,
    title: 'VoiceType',
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createIndicatorWindow() {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    indicatorWindow.show()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW } = primaryDisplay.workAreaSize
  const indicatorW = 300
  const indicatorH = 56

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
  } else {
    indicatorWindow.show()
  }
}

function hideIndicator() {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
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
  console.log(`[VoiceType] Hotkey set to: ${hotkeyStr} (keycode ${activeHotkey.triggerKeycode})`)

  uIOhook.on('keydown', (e) => {
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
        // Double-tap detected: toggle hands-free mode
        if (isHandsFreeMode) {
          // Stop hands-free recording
          isHandsFreeMode = false
          isHoldRecording = false
          sendToRenderer('recording-command', 'stop')
          sendToIndicator('recording-command', 'stop')
        } else {
          // Start hands-free recording
          isHandsFreeMode = true
          isHoldRecording = false
          sendToRenderer('recording-command', 'start-handsfree')
          showIndicator()
          sendToIndicator('recording-command', 'start-handsfree')
        }
      } else if (!isHandsFreeMode) {
        // Single press: start hold-to-record
        isHoldRecording = true

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
        // Release from hold-to-record: stop recording and process
        isHoldRecording = false
        sendToRenderer('recording-command', 'stop')
        sendToIndicator('recording-command', 'stop')
      }
      // If in hands-free mode, keyup is ignored (recording continues until next tap)
    }
  })

  uIOhook.start()
}

app.whenReady().then(() => {
  ensureUserDataDir()
  initializeDefaultData()
  createWindow()
  setupHotkeySystem()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  uIOhook.stop()
})

// Initialize default data files if they don't exist
function initializeDefaultData() {
  // Default settings
  if (!fs.existsSync(getDataFilePath('settings.json'))) {
    writeJsonFile('settings.json', {
      speechProvider: 'whisper',
      llmProvider: 'gemini',
      apiKeys: {},
      currentModeIndex: 0,
      customPrompts: {},
      fontSize: 16,
      theme: 'dark',
      micGain: 100,
      hotkey: 'RightAlt',
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

// Paste to external window (from main window -- minimizes VoiceType)
ipcMain.handle('paste-to-external', async (_, text: string) => {
  if (!mainWindow) return false

  try {
    // 1. Copy text to clipboard
    clipboard.writeText(text)

    // 2. Minimize VoiceType so previous window regains focus
    mainWindow.minimize()

    // 3. Wait for focus to shift
    await new Promise(resolve => setTimeout(resolve, 400))

    // 4. Simulate Ctrl+V via PowerShell
    await new Promise<void>((resolve, reject) => {
      exec(
        'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
        (error) => {
          if (error) reject(error)
          else resolve()
        }
      )
    })

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
ipcMain.handle('auto-type-text', async (_, text: string) => {
  try {
    // 1. Copy text to clipboard
    clipboard.writeText(text)

    // 2. Brief delay for clipboard
    await new Promise(resolve => setTimeout(resolve, 100))

    // 3. Simulate Ctrl+V via PowerShell (VoiceType stays in background)
    await new Promise<void>((resolve, reject) => {
      exec(
        'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
        (error) => {
          if (error) reject(error)
          else resolve()
        }
      )
    })

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

// Update hotkey — re-parse the new hotkey string so it takes effect immediately
ipcMain.handle('update-hotkey', (_, hotkey: string) => {
  activeHotkey = parseHotkeyString(hotkey)
  // Reset state to avoid stuck keys
  triggerKeyDown = false
  isHoldRecording = false
  isHandsFreeMode = false
  console.log(`[VoiceType] Hotkey updated to: ${hotkey} (keycode ${activeHotkey.triggerKeycode})`)
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
