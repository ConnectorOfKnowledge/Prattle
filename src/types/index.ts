import type { RecordingState } from '../constants/modes'

export interface Settings {
  speechProvider: 'whisper' | 'deepgram' | 'browser' | 'gemini'
  llmProvider: 'gemini' | 'claude' | 'openai'
  apiKeys: {
    openai?: string
    gemini?: string
    claude?: string
    deepgram?: string
  }
  currentModeIndex: number
  customPrompts: Record<number, string>
  fontSize: number
  micGain: number  // 0-200, percentage (100 = normal)
  theme: 'light' | 'dark'
  hotkey: string
  startOnLogin: boolean
}

export interface UserProfile {
  id: string
  email: string
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'none'
  plan: 'monthly' | 'annual' | 'free'
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

export interface Dictionary {
  replacements: Record<string, string>
}

export interface LearnedPattern {
  id: string
  description: string
  rule: string
  platform: string
  createdAt: string
  source: 'auto' | 'manual'
  active: boolean
}

export interface LearnedPatterns {
  patterns: LearnedPattern[]
}

export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Electron API exposed via preload
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Settings) => Promise<boolean>
      getDictionary: () => Promise<Dictionary>
      saveDictionary: (dictionary: Dictionary) => Promise<boolean>
      getLearnedPatterns: () => Promise<LearnedPatterns>
      saveLearnedPatterns: (patterns: LearnedPatterns) => Promise<boolean>
      pasteToExternal: (text: string) => Promise<boolean>
      autoTypeText: (text: string) => Promise<boolean>
      updateHotkey: (hotkey: string) => Promise<boolean>
      getUserDataPath: () => Promise<string>
      showSaveDialog: (options: any) => Promise<any>
      showOpenDialog: (options: any) => Promise<any>
      writeFile: (filePath: string, content: string) => Promise<boolean>
      readFile: (filePath: string) => Promise<string>
      hideIndicator: () => void
      onRecordingCommand: (callback: (command: string, data?: any) => void) => () => void
      // Target window tracking (shows which app will receive text)
      onTargetWindow: (callback: (title: string) => void) => () => void
      // Auto-start
      setStartOnLogin: (enabled: boolean) => Promise<boolean>
      getStartOnLogin: () => Promise<boolean>
      // Auto-updater
      checkForUpdates: () => void
      restartToUpdate: () => void
      onUpdateStatus: (callback: (status: string, info?: any) => void) => () => void
      // App version
      getAppVersion: () => Promise<string>
      // External URL
      openExternalUrl: (url: string) => Promise<boolean>
      // OAuth callback (from custom protocol handler)
      onOAuthCallback: (callback: (url: string) => void) => () => void
    }
  }
}
