import { app, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { readJsonFile, writeJsonFile } from './dataStore'
import { createWindow, getMainWindow } from './windowManager'

const isDev = !app.isPackaged

let tray: Tray | null = null

export function createTray(isQuittingRef: { value: boolean }): void {
  const iconPath = isDev
    ? path.join(__dirname, '../build/icon.png')
    : path.join(process.resourcesPath, 'build', 'icon.png')

  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Prattle -- Voice to Text')

  const settings = readJsonFile('settings.json')
  const startOnLogin = settings.startOnLogin !== false

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Prattle',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        } else {
          createWindow(isQuittingRef)
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
        isQuittingRef.value = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    } else {
      createWindow(isQuittingRef)
    }
  })
}
