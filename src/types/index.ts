export interface Settings {
  speechProvider: 'whisper' | 'deepgram' | 'browser' | 'gemini'
  llmProvider: 'gemini' | 'claude' | 'openai'
  apiKeys: {
    openai?: string
    gemini?: string
    claude?: string
    deepgram?: string
  }
  activePlatform: string
  autoProcess: boolean
  fontSize: number
  theme: 'light' | 'dark'
  globalRules: string
  hotkey: string
  learningMode: boolean
}

export interface PlatformPrompt {
  name: string
  icon: string
  prompt: string
  enabled: boolean
}

export interface PlatformPrompts {
  [key: string]: PlatformPrompt
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

export interface Ticket {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: 'open' | 'in-progress' | 'done'
  createdAt: string
  updatedAt: string
}

export type Tickets = Ticket[]

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
      getPlatformPrompts: () => Promise<PlatformPrompts>
      savePlatformPrompts: (prompts: PlatformPrompts) => Promise<boolean>
      getDictionary: () => Promise<Dictionary>
      saveDictionary: (dictionary: Dictionary) => Promise<boolean>
      getLearnedPatterns: () => Promise<LearnedPatterns>
      saveLearnedPatterns: (patterns: LearnedPatterns) => Promise<boolean>
      getTickets: () => Promise<Tickets>
      saveTickets: (tickets: Tickets) => Promise<boolean>
      pasteToExternal: (text: string) => Promise<boolean>
      pasteFromOverlay: (text: string) => Promise<boolean>
      updateHotkey: (hotkey: string) => Promise<boolean>
      getUserDataPath: () => Promise<string>
      showSaveDialog: (options: any) => Promise<any>
      showOpenDialog: (options: any) => Promise<any>
      writeFile: (filePath: string, content: string) => Promise<boolean>
      readFile: (filePath: string) => Promise<string>
    }
  }
}
