import { create } from 'zustand'
import type { Settings, PlatformPrompts, Dictionary, LearnedPatterns, Tickets, ChatMessage } from '../types'

export interface HistoryEntry {
  id: string
  text: string
  platform: string
  timestamp: string
}

interface ChatPanelContext {
  type: 'text-modify' | 'prompt-modify'
  platformId?: string
  contextText: string
}

interface AppState {
  // Data
  settings: Settings | null
  platformPrompts: PlatformPrompts | null
  dictionary: Dictionary | null
  learnedPatterns: LearnedPatterns | null
  tickets: Tickets | null

  // UI state
  isRecording: boolean
  isProcessing: boolean
  rawText: string
  processedText: string
  editedText: string
  currentView: 'main' | 'settings' | 'dictionary' | 'learning' | 'prompts' | 'tickets'
  statusMessage: string
  recordingDuration: number
  focusMode: boolean
  history: HistoryEntry[]
  showHistory: boolean

  // Platform sidebar state
  processedTextByPlatform: Record<string, string>
  editedTextByPlatform: Record<string, string>
  processingPlatforms: Record<string, boolean>
  sidebarCollapsed: boolean

  // Chat panel state
  chatMessages: ChatMessage[]
  chatPanelOpen: boolean
  chatPanelContext: ChatPanelContext | null

  // Actions
  setSettings: (settings: Settings) => void
  setPlatformPrompts: (prompts: PlatformPrompts) => void
  setDictionary: (dictionary: Dictionary) => void
  setLearnedPatterns: (patterns: LearnedPatterns) => void
  setTickets: (tickets: Tickets) => void
  setIsRecording: (isRecording: boolean) => void
  setIsProcessing: (isProcessing: boolean) => void
  setRawText: (text: string) => void
  setProcessedText: (text: string) => void
  setEditedText: (text: string) => void
  setCurrentView: (view: AppState['currentView']) => void
  setStatusMessage: (message: string) => void
  setRecordingDuration: (duration: number) => void
  setFocusMode: (focusMode: boolean) => void
  setShowHistory: (show: boolean) => void
  clearText: () => void
  addToHistory: (entry: HistoryEntry) => void

  // Platform sidebar actions
  setProcessedTextForPlatform: (platformId: string, text: string) => void
  setEditedTextForPlatform: (platformId: string, text: string) => void
  setProcessingPlatform: (platformId: string, processing: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  clearAllProcessedTexts: () => void

  // Chat panel actions
  setChatPanelOpen: (open: boolean) => void
  setChatPanelContext: (context: ChatPanelContext | null) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void

  // Data loading
  loadAllData: () => Promise<void>
  saveSettingsToFile: (settings: Settings) => Promise<void>
  savePlatformPromptsToFile: (prompts: PlatformPrompts) => Promise<void>
  saveDictionaryToFile: (dictionary: Dictionary) => Promise<void>
  saveLearnedPatternsToFile: (patterns: LearnedPatterns) => Promise<void>
  saveTicketsToFile: (tickets: Tickets) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Data
  settings: null,
  platformPrompts: null,
  dictionary: null,
  learnedPatterns: null,
  tickets: null,

  // UI state
  isRecording: false,
  isProcessing: false,
  rawText: '',
  processedText: '',
  editedText: '',
  currentView: 'main',
  statusMessage: 'Ready',
  recordingDuration: 0,
  focusMode: false,
  history: [],
  showHistory: false,

  // Platform sidebar state
  processedTextByPlatform: {},
  editedTextByPlatform: {},
  processingPlatforms: {},
  sidebarCollapsed: false,

  // Chat panel state
  chatMessages: [],
  chatPanelOpen: false,
  chatPanelContext: null,

  // Actions
  setSettings: (settings) => set({ settings }),
  setPlatformPrompts: (prompts) => set({ platformPrompts: prompts }),
  setDictionary: (dictionary) => set({ dictionary }),
  setLearnedPatterns: (patterns) => set({ learnedPatterns: patterns }),
  setTickets: (tickets) => set({ tickets }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setRawText: (text) => set({ rawText: text }),
  setProcessedText: (text) => set({ processedText: text, editedText: text }),
  setEditedText: (text) => set({ editedText: text }),
  setCurrentView: (view) => set({ currentView: view }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setRecordingDuration: (duration) => set({ recordingDuration: duration }),
  setFocusMode: (focusMode) => set({ focusMode }),
  setShowHistory: (show) => set({ showHistory: show }),
  clearText: () => set({
    rawText: '',
    processedText: '',
    editedText: '',
    processedTextByPlatform: {},
    editedTextByPlatform: {},
  }),
  addToHistory: (entry) => {
    const history = [...get().history, entry].slice(-50)
    set({ history })
  },

  // Platform sidebar actions
  setProcessedTextForPlatform: (platformId, text) => {
    const current = get().processedTextByPlatform
    set({ processedTextByPlatform: { ...current, [platformId]: text } })
  },
  setEditedTextForPlatform: (platformId, text) => {
    const current = get().editedTextByPlatform
    set({ editedTextByPlatform: { ...current, [platformId]: text } })
  },
  setProcessingPlatform: (platformId, processing) => {
    const current = get().processingPlatforms
    set({ processingPlatforms: { ...current, [platformId]: processing } })
  },
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  clearAllProcessedTexts: () => set({
    processedTextByPlatform: {},
    editedTextByPlatform: {},
    processingPlatforms: {},
  }),

  // Chat panel actions
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  setChatPanelContext: (context) => set({ chatPanelContext: context }),
  addChatMessage: (message) => {
    const messages = [...get().chatMessages, message]
    set({ chatMessages: messages })
  },
  clearChatMessages: () => set({ chatMessages: [] }),

  // Data loading
  loadAllData: async () => {
    try {
      const [settings, platformPrompts, dictionary, learnedPatterns, tickets] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getPlatformPrompts(),
        window.electronAPI.getDictionary(),
        window.electronAPI.getLearnedPatterns(),
        window.electronAPI.getTickets(),
      ])
      set({ settings, platformPrompts, dictionary, learnedPatterns, tickets })
    } catch (e) {
      console.error('Failed to load data:', e)
    }
  },

  saveSettingsToFile: async (settings) => {
    await window.electronAPI.saveSettings(settings)
    set({ settings })
  },

  savePlatformPromptsToFile: async (prompts) => {
    await window.electronAPI.savePlatformPrompts(prompts)
    set({ platformPrompts: prompts })
  },

  saveDictionaryToFile: async (dictionary) => {
    await window.electronAPI.saveDictionary(dictionary)
    set({ dictionary })
  },

  saveLearnedPatternsToFile: async (patterns) => {
    await window.electronAPI.saveLearnedPatterns(patterns)
    set({ learnedPatterns: patterns })
  },

  saveTicketsToFile: async (tickets) => {
    await window.electronAPI.saveTickets(tickets)
    set({ tickets })
  },
}))
