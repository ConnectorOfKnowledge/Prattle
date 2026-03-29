import type { RecordingState } from '../constants/modes'

export interface Settings {
  speechProvider: 'deepgram'  // All speech goes through Deepgram via proxy
  llmProvider: 'gemini' | 'claude' | 'openai'  // Backend uses this to route
  apiKeys: {
    openai?: string
    gemini?: string
    claude?: string
    deepgram?: string
  }  // Kept for backwards compat with settings.json on disk -- UI removed
  currentModeIndex: number
  customPrompts: Record<number, string>
  fontSize: number
  micGain: number  // 0-200, percentage (100 = normal)
  theme: 'light' | 'dark'
  hotkey: string
  startOnLogin: boolean
  trainingEnabled: boolean  // When off, hides training toggle + Learning tab
}

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'canceled' | 'past_due' | 'none'
export type SubscriptionPlan = 'monthly' | 'annual' | 'family' | 'trial' | 'free' | 'none'
export type AccessType = 'subscription' | 'trial' | 'family' | 'expired'

export interface SubscriptionResponse {
  status: SubscriptionStatus
  plan: SubscriptionPlan
  accessType?: AccessType
  trialEndsAt?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

export interface UserProfile {
  id: string
  email: string
  subscriptionStatus: SubscriptionStatus
  plan: SubscriptionPlan
  accessType: AccessType
  trialEndsAt?: string
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
  // Training context (optional, added v1.7.0)
  originalText?: string
  correctedText?: string
  action?: 'prompt_rule' | 'dictionary_add'
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

export interface HistoryEntry {
  id: string
  rawText: string
  processedText: string
  mode: string
  durationMs: number
  createdAt: string  // ISO string
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
      // History
      getHistory: () => Promise<HistoryEntry[]>
      addHistoryEntry: (entry: HistoryEntry) => Promise<boolean>
      clearHistory: () => Promise<boolean>
    }
  }
}
