import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Settings } from '../types'
import { HiFolderOpen } from 'react-icons/hi2'
import Toggle from './Toggle'

export default function SettingsView() {
  const { settings, saveSettingsToFile } = useAppStore()
  const [localSettings, setLocalSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  const [dataPath, setDataPath] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<string>('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)

  useEffect(() => {
    if (settings) setLocalSettings({ ...settings })
    window.electronAPI.getUserDataPath().then(setDataPath)
    window.electronAPI.getAppVersion().then(setAppVersion)

    // Listen for update status
    const cleanup = window.electronAPI.onUpdateStatus((status, info) => {
      setUpdateStatus(status)
      if (info) setUpdateInfo(info)
    })
    return cleanup
  }, [settings])

  if (!localSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-cd-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings(prev => prev ? { ...prev, [key]: value } : prev)
  }

  const handleSave = async () => {
    if (localSettings) {
      await saveSettingsToFile(localSettings)
      // Re-register hotkey if it changed
      if (localSettings.hotkey !== settings?.hotkey) {
        await window.electronAPI.updateHotkey(localSettings.hotkey)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <h2 className="text-lg font-semibold text-cd-text">Settings</h2>

      {/* Service Info */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-2">Speech & AI Processing</h3>
        <p className="text-sm text-cd-subtle">
          Prattle uses Deepgram Nova-3 for speech recognition and AI models for text processing.
          All processing is handled securely through Prattle's servers.
        </p>
      </div>

      {/* Preferences */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3">Preferences</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cd-text mb-1">
              Font Size: {localSettings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              value={localSettings.fontSize}
              onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
              className="w-full accent-cd-accent"
            />
            <div className="flex justify-between text-xs text-cd-subtle">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-cd-text mb-1">
              Mic Gain: {localSettings.micGain ?? 100}%
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={localSettings.micGain ?? 100}
              onChange={(e) => updateSetting('micGain', parseInt(e.target.value))}
              className="w-full accent-cd-accent"
            />
            <div className="flex justify-between text-xs text-cd-subtle">
              <span>Mute</span>
              <span>Normal</span>
              <span>200%</span>
            </div>
            <p className="text-xs text-cd-subtle mt-1">
              Boost or reduce mic input volume. 100% = no change.
            </p>
          </div>
        </div>
      </div>

      {/* Auto-Paste Notice */}
      <div className="bg-blue-500/10 rounded-2xl border border-blue-500/20 p-5">
        <h3 className="font-medium text-blue-400 mb-2">About Auto-Paste</h3>
        <p className="text-sm text-cd-subtle leading-relaxed">
          After dictation, Prattle automatically pastes text into the active window.
          This works in most apps (Notepad, VS Code, Claude Code, etc.), but <strong className="text-cd-text">Chrome web pages</strong> block
          synthetic keyboard input for security reasons. When using Chrome, your text is still
          copied to the clipboard -- just click in the text field and press <strong className="text-cd-text">Ctrl+V</strong> to paste.
        </p>
      </div>

      {/* Global Hotkey */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3">Global Hotkey</h3>
        <p className="text-xs text-cd-subtle mb-3">
          <strong>Hold</strong> to record, release to process and auto-type.
          <strong> Double-tap</strong> for hands-free mode (tap again to stop).
          After dictation, hold again to speak a rewrite instruction.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={localSettings.hotkey}
            onChange={(e) => updateSetting('hotkey', e.target.value)}
            className="input-field flex-1 text-sm font-mono"
          >
            <option value="RightAlt">Right Alt</option>
            <option value="F2">F2</option>
            <option value="F8">F8</option>
            <option value="F9">F9</option>
            <option value="Insert">Insert</option>
            <option value="ScrollLock">Scroll Lock</option>
            <option value="Pause">Pause</option>
            <option value="Ctrl+Space">Ctrl + Space</option>
            <option value="Ctrl+Shift+Space">Ctrl + Shift + Space</option>
          </select>
        </div>
        <p className="text-xs text-cd-subtle mt-2">
          Pick a single key you can comfortably hold while talking. Right Alt is recommended.
        </p>
      </div>

      {/* Startup */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3">Startup</h3>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium text-cd-text">Start on Windows login</div>
            <div className="text-xs text-cd-subtle">Prattle launches minimized to the system tray when you log in</div>
          </div>
          <Toggle
            checked={localSettings.startOnLogin !== false}
            onChange={(checked) => {
              updateSetting('startOnLogin', checked)
              window.electronAPI.setStartOnLogin(checked)
            }}
            label="Start on Windows login"
          />
        </label>
      </div>

      {/* Training Mode */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3">Training</h3>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium text-cd-text">Enable training mode</div>
            <div className="text-xs text-cd-subtle">Shows the Train toggle on the dictation screen and the Learning tab in navigation. Use this to teach Prattle your writing preferences.</div>
          </div>
          <Toggle
            checked={localSettings.trainingEnabled === true}
            onChange={(checked) => updateSetting('trainingEnabled', checked)}
            activeColor="bg-amber-500"
            label="Enable training mode"
          />
        </label>
      </div>

      {/* Data Location */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-2">Data Storage</h3>
        <div className="flex items-center gap-2 text-sm text-cd-subtle">
          <HiFolderOpen className="w-4 h-4" />
          <span className="font-mono text-xs break-all">{dataPath}</span>
        </div>
        <p className="text-xs text-cd-subtle mt-1">
          All your settings, dictionary, and learned patterns are stored here.
        </p>
      </div>

      {/* About & Updates */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3">About</h3>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-cd-text">Prattle</div>
            <div className="text-xs text-cd-subtle font-mono">v{appVersion || '1.0.0'}</div>
          </div>
          <button
            onClick={() => {
              if (updateStatus === 'ready') {
                window.electronAPI.restartToUpdate()
              } else {
                setUpdateStatus('checking')
                window.electronAPI.checkForUpdates()
              }
            }}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cd-accent/50 ${
              updateStatus === 'ready'
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-cd-bg border border-white/10 text-cd-text hover:bg-white/10'
            }`}
          >
            {updateStatus === 'checking' ? 'Checking...' :
             updateStatus === 'downloading' ? `Downloading ${updateInfo?.percent || ''}%` :
             updateStatus === 'ready' ? 'Restart to Update' :
             updateStatus === 'up-to-date' ? 'Up to Date' :
             updateStatus === 'dev-mode' ? 'Dev Mode' :
             'Check for Updates'}
          </button>
        </div>
        {updateStatus === 'available' && (
          <p className="text-xs text-green-400">A new version is available and downloading...</p>
        )}
        {updateStatus === 'ready' && (
          <p className="text-xs text-green-400">Update downloaded! Restart Prattle to install.</p>
        )}
        {updateStatus === 'error' && (
          <p className="text-xs text-red-400">Update check failed: {updateInfo || 'Unknown error'}</p>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          className={`btn-primary ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
