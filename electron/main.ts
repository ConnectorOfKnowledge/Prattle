import { app, BrowserWindow, ipcMain, dialog, clipboard, globalShortcut, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

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
let overlayWindow: BrowserWindow | null = null

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
    backgroundColor: '#fafbfc',
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

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    overlayWindow.focus()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW } = primaryDisplay.workAreaSize
  const overlayW = 380
  const overlayH = 220

  overlayWindow = new BrowserWindow({
    width: overlayW,
    height: overlayH,
    x: Math.round((screenW - overlayW) / 2),
    y: 80,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/?overlay=true')
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { overlay: 'true' }
    })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

function toggleOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.close()
    overlayWindow = null
  } else {
    createOverlayWindow()
  }
}

function registerHotkey(hotkey: string) {
  globalShortcut.unregisterAll()
  if (!hotkey) return

  try {
    const accelerator = hotkey.replace('Ctrl+', 'CommandOrControl+')
    globalShortcut.register(accelerator, toggleOverlay)
  } catch (e) {
    console.error('Failed to register hotkey:', e)
  }
}

app.whenReady().then(() => {
  ensureUserDataDir()
  initializeDefaultData()
  createWindow()

  // Register global hotkey from saved settings
  const settings = readJsonFile('settings.json')
  if (settings.hotkey) {
    registerHotkey(settings.hotkey)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Initialize default data files if they don't exist
function initializeDefaultData() {
  // Default settings
  if (!fs.existsSync(getDataFilePath('settings.json'))) {
    writeJsonFile('settings.json', {
      speechProvider: 'whisper',
      llmProvider: 'gemini',
      apiKeys: {},
      activePlatform: 'ai-chat',
      autoProcess: true,
      fontSize: 16,
      theme: 'light',
      globalRules: 'Always remove filler words and verbal hesitations (um, uh, ah, er, like, you know, I mean, sort of, kind of). Remove dead air artifacts and false starts.',
      hotkey: 'Ctrl+Shift+Space',
      learningMode: false,
    })
  } else {
    // Migrate existing settings — add any missing fields
    const settings = readJsonFile('settings.json')
    let changed = false
    if (settings.globalRules === undefined || settings.globalRules === '') {
      settings.globalRules = 'Always remove filler words and verbal hesitations (um, uh, ah, er, like, you know, I mean, sort of, kind of). Remove dead air artifacts and false starts.'
      changed = true
    }
    if (settings.hotkey === undefined) {
      settings.hotkey = 'Ctrl+Shift+Space'
      changed = true
    }
    if (settings.learningMode === undefined) {
      settings.learningMode = false
      changed = true
    }
    if (changed) writeJsonFile('settings.json', settings)
  }

  // Default platform prompts
  if (!fs.existsSync(getDataFilePath('platform-prompts.json'))) {
    writeJsonFile('platform-prompts.json', {
      'ai-chat': {
        name: 'AI Chat',
        icon: 'robot',
        prompt: 'Clean up this dictated text for an AI chat. Extract the core intent and essential information, removing all filler, redundant phrases, and verbal tics. Present the result in concise Markdown to minimize token usage and character count. If the user changed their mind mid-sentence, output only the final intent. Return ONLY the streamlined text.',
        enabled: true,
      },
      'text-message': {
        name: 'Text Message',
        icon: 'phone',
        prompt: 'Clean up this dictated text for a text message so it appears naturally human-typed. Use standard capitalization for the start of sentences and pronouns. Remove all verbal filler and false starts. Do not use M-dashes or uncommon punctuation. If the input is short, keep it brief and do not over-edit. Return ONLY the cleaned text.',
        enabled: true,
      },
      'professional-email': {
        name: 'Professional Email',
        icon: 'briefcase',
        prompt: 'Transform this dictated speech into a clear, concise, and professional email. Fix grammar and remove all verbal tics or repetitive phrasing. Maintain a polished tone without using M-dashes or excessive punctuation. Organize the thoughts into a logical professional structure. Return ONLY the cleaned text.',
        enabled: true,
      },
      'personal-email': {
        name: 'Personal Email',
        icon: 'envelope',
        prompt: 'Clean up this dictated text for a personal email. Maintain a clear, friendly, and relaxed tone while fixing grammar and removing filler words. Preserve the user\'s personal voice and intent. Do not use M-dashes. Return ONLY the cleaned text.',
        enabled: true,
      },
      'tiktok': {
        name: 'TikTok',
        icon: 'share',
        prompt: 'Refine this dictated text into a TikTok-appropriate caption or script. Use a punchy hook and concise phrasing. Remove verbal fillers while keeping the energy high and the voice authentic. Adapt the flow to suit typical TikTok conventions, including emojis if suggested by the tone. Return ONLY the cleaned text.',
        enabled: true,
      },
      'brain-dump': {
        name: 'Brain Dump',
        icon: 'clipboard',
        prompt: 'Process this dictated Brain Dump into a coherent, organized concept. Synthesize rambling thoughts, verbal tics, and "gibberish" into a logical flow that makes sense. Remove all conversational artifacts and filler. Structure the output so the core idea or project is clear and actionable. Return ONLY the synthesized text.',
        enabled: true,
      },
      'raw': {
        name: 'Raw (No Processing)',
        icon: 'type',
        prompt: '',
        enabled: true,
      },
    })
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

  // Default tickets
  if (!fs.existsSync(getDataFilePath('tickets.json'))) {
    writeJsonFile('tickets.json', [])
  }
}

// ---- IPC Handlers ----

// Settings
ipcMain.handle('get-settings', () => readJsonFile('settings.json'))
ipcMain.handle('save-settings', (_, settings) => {
  writeJsonFile('settings.json', settings)
  return true
})

// Platform prompts
ipcMain.handle('get-platform-prompts', () => readJsonFile('platform-prompts.json'))
ipcMain.handle('save-platform-prompts', (_, prompts) => {
  writeJsonFile('platform-prompts.json', prompts)
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

// Tickets
ipcMain.handle('get-tickets', () => readJsonFile('tickets.json', []))
ipcMain.handle('save-tickets', (_, tickets) => {
  writeJsonFile('tickets.json', tickets)
  return true
})

// Get user data path (for display in settings)
ipcMain.handle('get-user-data-path', () => userDataPath)

// Paste to external window
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

// Paste from overlay — hides overlay instead of minimizing main window
ipcMain.handle('paste-from-overlay', async (_, text: string) => {
  if (!overlayWindow) return false

  try {
    clipboard.writeText(text)
    overlayWindow.hide()
    await new Promise(resolve => setTimeout(resolve, 300))

    await new Promise<void>((resolve, reject) => {
      exec(
        'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
        (error) => {
          if (error) reject(error)
          else resolve()
        }
      )
    })

    // Show overlay again after pasting
    await new Promise(resolve => setTimeout(resolve, 300))
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.show()
    }

    return true
  } catch (error) {
    console.error('Overlay paste failed:', error)
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.show()
    }
    return false
  }
})

// Toggle overlay from renderer
ipcMain.handle('toggle-overlay', () => {
  toggleOverlay()
  return true
})

// Update global hotkey
ipcMain.handle('update-hotkey', (_, hotkey: string) => {
  registerHotkey(hotkey)
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
