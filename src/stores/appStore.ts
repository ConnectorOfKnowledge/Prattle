import { create } from 'zustand'
import type { Settings, Dictionary, LearnedPatterns, ChatMessage, UserProfile } from '../types'
import type { RecordingState } from '../constants/modes'

interface AppState {
  // Data
  settings: Settings | null
  dictionary: Dictionary | null
  learnedPatterns: LearnedPatterns | null

  // Auth state
  user: UserProfile | null
  isAuthenticated: boolean
  isCheckingAuth: boolean

  // UI state
  recordingState: RecordingState
  rawText: string
  processedText: string
  editedText: string
  lastCommittedText: string
  currentView: 'main' | 'settings' | 'dictionary' | 'modes' | 'learning' | 'account' | 'auth'
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

  // Auth actions
  setUser: (user: UserProfile | null) => void
  setIsAuthenticated: (auth: boolean) => void
  setIsCheckingAuth: (checking: boolean) => void

  // Chat panel actions
  setChatPanelOpen: (open: boolean) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void

  // Subscription
  refreshSubscription: () => Promise<void>

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

  // Auth state
  user: null,
  isAuthenticated: false,
  isCheckingAuth: false,

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

  // Auth actions
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setIsCheckingAuth: (isCheckingAuth) => set({ isCheckingAuth }),

  // Chat panel actions
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  addChatMessage: (message) => {
    const messages = [...get().chatMessages, message]
    set({ chatMessages: messages })
  },
  clearChatMessages: () => set({ chatMessages: [] }),

  // Subscription
  refreshSubscription: async () => {
    const { getSubscriptionStatus } = await import('../services/authService')
    const status = await getSubscriptionStatus()
    const currentUser = get().user
    if (currentUser) {
      // Map SubscriptionResponse fields to UserProfile fields.
      // The API may return values outside the UserProfile union (e.g. 'free'),
      // so we map them to the closest equivalent.
      const planMap: Record<string, UserProfile['plan']> = {
        monthly: 'monthly',
        annual: 'annual',
        free: 'none',
      }
      const statusMap: Record<string, UserProfile['subscriptionStatus']> = {
        active: 'active',
        canceled: 'canceled',
        past_due: 'past_due',
        none: 'none',
      }
      set({
        user: {
          ...currentUser,
          subscriptionStatus: statusMap[status.status] || 'none',
          plan: planMap[status.plan] || 'none',
          accessType: status.accessType || 'expired',
          trialEndsAt: status.trialEndsAt,
          currentPeriodEnd: status.currentPeriodEnd,
          cancelAtPeriodEnd: status.cancelAtPeriodEnd,
        }
      })
    }
  },

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
