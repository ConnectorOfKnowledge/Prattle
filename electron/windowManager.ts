import { app, BrowserWindow, screen } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let indicatorWindow: BrowserWindow | null = null
let indicatorReady = false
let indicatorShouldShow = false
let indicatorPendingMessages: { channel: string; args: unknown[] }[] = []

const isDev = !app.isPackaged

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getIndicatorWindow(): BrowserWindow | null {
  return indicatorWindow
}

export function createWindow(isQuittingRef: { value: boolean }): void {
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
    if (!isQuittingRef.value) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

export function createIndicatorWindow(): void {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) return

  indicatorReady = false

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
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  indicatorWindow.webContents.once('did-finish-load', () => {
    indicatorReady = true

    if (indicatorShouldShow && indicatorWindow && !indicatorWindow.isDestroyed()) {
      indicatorWindow.show()
    }

    for (const msg of indicatorPendingMessages) {
      if (indicatorWindow && !indicatorWindow.isDestroyed()) {
        indicatorWindow.webContents.send(msg.channel, ...msg.args)
      }
    }
    indicatorPendingMessages = []
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
    indicatorReady = false
  })

  indicatorWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Prattle] Indicator renderer crashed:', details.reason)
    indicatorWindow = null
    indicatorReady = false
    setTimeout(() => createIndicatorWindow(), 500)
  })
}

export function showIndicator(): void {
  indicatorShouldShow = true

  if (!indicatorWindow || indicatorWindow.isDestroyed()) {
    createIndicatorWindow()
  } else {
    indicatorWindow.setAlwaysOnTop(true, 'screen-saver')
    indicatorWindow.show()
  }
}

export function hideIndicator(): void {
  indicatorShouldShow = false
  indicatorPendingMessages = []

  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    if (indicatorReady) {
      indicatorWindow.webContents.send('recording-command', 'done')
    }
    indicatorWindow.hide()
  }
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function sendToIndicator(channel: string, ...args: unknown[]): void {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    if (indicatorReady) {
      indicatorWindow.webContents.send(channel, ...args)
    } else {
      indicatorPendingMessages.push({ channel, args })
    }
  }
}
