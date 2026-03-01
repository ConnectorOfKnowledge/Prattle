import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Settings } from '../types'
import { HiEye, HiEyeSlash, HiFolderOpen } from 'react-icons/hi2'

export default function SettingsView() {
  const { settings, saveSettingsToFile } = useAppStore()
  const [localSettings, setLocalSettings] = useState<Settings | null>(null)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [dataPath, setDataPath] = useState('')

  useEffect(() => {
    if (settings) setLocalSettings({ ...settings })
    window.electronAPI.getUserDataPath().then(setDataPath)
  }, [settings])

  if (!localSettings) return null

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings(prev => prev ? { ...prev, [key]: value } : prev)
  }

  const updateApiKey = (provider: string, value: string) => {
    setLocalSettings(prev => {
      if (!prev) return prev
      return {
        ...prev,
        apiKeys: { ...prev.apiKeys, [provider]: value }
      }
    })
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

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const maskKey = (key: string | undefined) => {
    if (!key) return ''
    if (key.length <= 8) return '****'
    return key.substring(0, 4) + '****' + key.substring(key.length - 4)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <h2 className="text-lg font-semibold text-gray-800">Settings</h2>

      {/* Speech Provider */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3">Speech-to-Text Provider</h3>
        <div className="space-y-2">
          {[
            { id: 'gemini', name: 'Google Gemini', desc: 'Uses your Gemini API key. Free tier available.' },
            { id: 'whisper', name: 'OpenAI Whisper', desc: 'Best accuracy, ~$0.006/min' },
            { id: 'deepgram', name: 'Deepgram Nova-2', desc: 'Fast & accurate, real-time capable' },
          ].map(provider => (
            <label
              key={provider.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                ${localSettings.speechProvider === provider.id
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-surface-200 hover:border-surface-300'
                }`}
            >
              <input
                type="radio"
                name="speechProvider"
                value={provider.id}
                checked={localSettings.speechProvider === provider.id}
                onChange={(e) => updateSetting('speechProvider', e.target.value as Settings['speechProvider'])}
                className="text-primary-500"
              />
              <div>
                <div className="font-medium text-sm text-gray-800">{provider.name}</div>
                <div className="text-xs text-gray-500">{provider.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* LLM Provider */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3">AI Processing Provider</h3>
        <p className="text-xs text-gray-500 mb-3">Used for tone adjustment, text cleaning, and learning from your edits</p>
        <div className="space-y-2">
          {[
            { id: 'gemini', name: 'Google Gemini', desc: 'Generous free tier, fast', keyField: 'gemini' },
            { id: 'claude', name: 'Anthropic Claude', desc: 'Excellent writing quality', keyField: 'claude' },
            { id: 'openai', name: 'OpenAI GPT', desc: 'Versatile, widely used', keyField: 'openai' },
          ].map(provider => (
            <label
              key={provider.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                ${localSettings.llmProvider === provider.id
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-surface-200 hover:border-surface-300'
                }`}
            >
              <input
                type="radio"
                name="llmProvider"
                value={provider.id}
                checked={localSettings.llmProvider === provider.id}
                onChange={(e) => updateSetting('llmProvider', e.target.value as Settings['llmProvider'])}
                className="text-primary-500"
              />
              <div>
                <div className="font-medium text-sm text-gray-800">{provider.name}</div>
                <div className="text-xs text-gray-500">{provider.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3">API Keys</h3>
        <p className="text-xs text-gray-500 mb-4">
          Keys are stored locally on your computer only. Never sent anywhere except the API provider.
        </p>

        <div className="space-y-4">
          {[
            { id: 'openai', label: 'OpenAI API Key', hint: 'Used for Whisper speech-to-text and GPT processing' },
            { id: 'gemini', label: 'Google Gemini API Key', hint: 'Get from ai.google.dev' },
            { id: 'claude', label: 'Anthropic Claude API Key', hint: 'Get from console.anthropic.com' },
            { id: 'deepgram', label: 'Deepgram API Key', hint: 'Get from console.deepgram.com' },
          ].map(key => (
            <div key={key.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{key.label}</label>
              <div className="relative">
                <input
                  type={showKeys[key.id] ? 'text' : 'password'}
                  value={showKeys[key.id]
                    ? (localSettings.apiKeys as any)[key.id] || ''
                    : (localSettings.apiKeys as any)[key.id]
                      ? maskKey((localSettings.apiKeys as any)[key.id])
                      : ''
                  }
                  onChange={(e) => updateApiKey(key.id, e.target.value)}
                  onFocus={() => setShowKeys(prev => ({ ...prev, [key.id]: true }))}
                  placeholder={`Enter your ${key.label}`}
                  className="input-field pr-10 text-sm font-mono"
                />
                <button
                  onClick={() => toggleShowKey(key.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showKeys[key.id] ? <HiEyeSlash className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">{key.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3">Preferences</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Auto-process with AI</div>
              <div className="text-xs text-gray-500">Automatically clean up text after transcription</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.autoProcess}
                onChange={(e) => updateSetting('autoProcess', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Learning Mode</div>
              <div className="text-xs text-gray-500">Auto-learn word corrections to your dictionary when you edit and copy</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.learningMode}
                onChange={(e) => updateSetting('learningMode', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Font Size: {localSettings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              value={localSettings.fontSize}
              onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global Hotkey */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3">Global Hotkey</h3>
        <p className="text-xs text-gray-500 mb-3">
          Press this keyboard shortcut from any app to open the VoiceType quick-record overlay.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={localSettings.hotkey}
            onChange={(e) => updateSetting('hotkey', e.target.value)}
            placeholder="e.g., Ctrl+Shift+Space"
            className="input-field text-sm font-mono flex-1"
          />
          <div className="text-xs text-gray-400 shrink-0">Format: Ctrl+Shift+Key</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Common options: Ctrl+Shift+Space, Ctrl+Shift+R, Ctrl+Alt+V
        </p>
      </div>

      {/* Data Location */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-2">Data Storage</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <HiFolderOpen className="w-4 h-4" />
          <span className="font-mono text-xs break-all">{dataPath}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          All your settings, dictionary, and learned patterns are stored here.
        </p>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-200 shadow-sm
            ${saved
              ? 'bg-green-500 text-white'
              : 'bg-primary-500 hover:bg-primary-600 text-white hover:shadow-md'
            }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
