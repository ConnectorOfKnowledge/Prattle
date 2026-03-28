import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { sendToRenderer } from './windowManager'

const isDev = !app.isPackaged

export function setupAutoUpdater(): void {
  if (isDev) {
    console.log('[Prattle] Dev mode -- skipping auto-updater')
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
