import { create } from 'zustand'
import type { Settings, Dictionary, LearnedPatterns, ChatMessage } from '../types'
import type { RecordingState } from '../constants/modes'

interface AppState {
  // Data
  settings: Settings | null
  dictionary: Dictionary | null
  learnedPatterns: LearnedPatterns | null

  // UI state
  recordingState: RecordingState
  rawText: string
  processedText: string
  editedText: string
  lastCommittedText: string
  currentView: 'main' | 'settings' | 'dictionary' | 'modes'
  statusMessage: string
  recordingDuration: number

  // Chat panel state
  chatMessages: ChatMessage[]
  chatPanelOpen: boolean

  // Actions
  setSettings: (settings: Settings) => void
  setDictionary: (dictionary: Dictionary) => void
  setLearnedPatterns: (patterns: LearnedPatterns) => void
  setRecordingState: (state: RecordingState) => void
  setRawText: (text: string) => void
  setProcessedText: (text: string) => void
  setEditedText: (text: string) => void
  setLastCommittedText: (text: string) => void
  setCurrentView: (view: AppState['currentView']) => void
  setStatusMessage: (message: string) => void
  setRecordingDuration: (duration: number) => void
  clearText: () => void

  // Chat panel actions
  setChatPanelOpen: (open: boolean) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void

  // Data loading
  loadAllData: () => Promise<void>
  saveSettingsToFile: (settings: Settings) => Promise<void>
  saveDictionaryToFile: (dictionary: Dictionary) => Promise<void>
  saveLearnedPatternsToFile: (patterns: LearnedPatterns) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Data
  settings: null,
  dictionary: null,
  learnedPatterns: null,

  // UI state
  recordingState: 'idle',
  rawText: '',
  processedText: '',
  editedText: '',
  lastCommittedText: '',
  currentView: 'main',
  statusMessage: 'Ready',
  recordingDuration: 0,

  // Chat panel state
  chatMessages: [],
  chatPanelOpen: false,

  // Actions
  setSettings: (settings) => set({ settings }),
  setDictionary: (dictionary) => set({ dictionary }),
  setLearnedPatterns: (patterns) => set({ learnedPatterns: patterns }),
  setRecordingState: (recordingState) => set({ recordingState }),
  setRawText: (text) => set({ rawText: text }),
  setProcessedText: (text) => set({ processedText: text, editedText: text }),
  setEditedText: (text) => set({ editedText: text }),
  setLastCommittedText: (text) => set({ lastCommittedText: text }),
  setCurrentView: (view) => set({ currentView: view }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setRecordingDuration: (duration) => set({ recordingDuration: duration }),
  clearText: () => set({
    rawText: '',
    processedText: '',
    editedText: '',
    lastCommittedText: '',
  }),

  // Chat panel actions
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  addChatMessage: (message) => {
    const messages = [...get().chatMessages, message]
    set({ chatMessages: messages })
  },
  clearChatMessages: () => set({ chatMessages: [] }),

  // Data loading
  loadAllData: async () => {
    try {
      const [settings, dictionary, learnedPatterns] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getDictionary(),
        window.electronAPI.getLearnedPatterns(),
      ])
      set({ settings, dictionary, learnedPatterns })
    } catch (e) {
      console.error('Failed to load data:', e)
    }
  },

  saveSettingsToFile: async (settings) => {
    await window.electronAPI.saveSettings(settings)
    set({ settings })
  },

  saveDictionaryToFile: async (dictionary) => {
    await window.electronAPI.saveDictionary(dictionary)
    set({ dictionary })
  },

  saveLearnedPatternsToFile: async (patterns) => {
    await window.electronAPI.saveLearnedPatterns(patterns)
    set({ learnedPatterns: patterns })
  },
}))
