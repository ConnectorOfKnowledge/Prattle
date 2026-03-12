import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import DictionaryView from './components/DictionaryView'
import ModesView from './components/ModesView'
import AuthView from './components/AuthView'
import AccountView from './components/AccountView'
import Header from './components/Header'
import BugReporter from './components/BugReporter'
import { getSession, getSubscriptionStatus, onAuthStateChange, exchangeOAuthCode } from './services/authService'
import { syncOnLogin, clearSyncTimers } from './services/syncService'

export default function App() {
  const { currentView, loadAllData, settings, dictionary, learnedPatterns, setUser, setIsCheckingAuth } = useAppStore()
  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    // Run cloud sync after login — pulls cloud data and merges with local
    const runCloudSync = async () => {
      const store = useAppStore.getState()
      if (!store.settings || !store.dictionary || !store.learnedPatterns) return
      try {
        const result = await syncOnLogin(store.settings, store.dictionary, store.learnedPatterns)
        // Update store with merged data (also saves locally)
        if (result.hadCloudData) {
          await window.electronAPI.saveSettings(result.settings)
          await window.electronAPI.saveDictionary(result.dictionary)
          await window.electronAPI.saveLearnedPatterns(result.patterns)
          useAppStore.setState({
            settings: result.settings,
            dictionary: result.dictionary,
            learnedPatterns: result.patterns,
          })
          console.log('[Prattle] Cloud sync complete — merged cloud data')
        } else {
          console.log('[Prattle] Cloud sync complete — pushed local data to cloud (first sync)')
        }
      } catch (err) {
        console.error('[Prattle] Cloud sync failed:', err)
      }
    }

    // Load local data first, THEN check auth (sync needs local data loaded)
    const init = async () => {
      await loadAllData()
      window.electronAPI.getAppVersion().then(setAppVersion)
      await checkAuth()
    }

    // Check for existing auth session
    const checkAuth = async () => {
      setIsCheckingAuth(true)
      try {
        const session = await getSession()
        if (session) {
          const sub = await getSubscriptionStatus()
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            subscriptionStatus: sub.status,
            plan: sub.plan,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          })
          runCloudSync()
        }
      } catch {
        // No session — that's fine, free tier
      } finally {
        setIsCheckingAuth(false)
      }
    }
    init()

    // Listen for auth changes (login/logout)
    const cleanupAuth = onAuthStateChange(async (session) => {
      if (session) {
        const sub = await getSubscriptionStatus()
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          subscriptionStatus: sub.status,
          plan: sub.plan,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        })
      } else {
        clearSyncTimers()
        setUser(null)
      }
    })

    // Listen for OAuth callbacks from the custom protocol handler (prattle://)
    const cleanupOAuth = window.electronAPI.onOAuthCallback(async (url: string) => {
      console.log('[Prattle] OAuth callback received in renderer')
      try {
        const session = await exchangeOAuthCode(url)
        if (session) {
          const sub = await getSubscriptionStatus()
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            subscriptionStatus: sub.status,
            plan: sub.plan,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          })
          // Navigate to main view and sync cloud data
          useAppStore.getState().setCurrentView('main')
          runCloudSync()
        }
      } catch (err) {
        console.error('[Prattle] OAuth exchange failed:', err)
      }
    })

    return () => {
      cleanupAuth()
      cleanupOAuth()
    }
  }, [])

  // Show loading while data loads
  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center bg-cd-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cd-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-cd-subtle text-sm">Loading Prattle...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-cd-bg overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden">
        {currentView === 'main' && <div className="h-full overflow-y-auto"><MainView /></div>}
        {currentView === 'modes' && <div className="h-full overflow-y-auto"><ModesView /></div>}
        {currentView === 'settings' && <div className="h-full overflow-y-auto"><SettingsView /></div>}
        {currentView === 'dictionary' && <div className="h-full overflow-y-auto"><DictionaryView /></div>}
        {currentView === 'auth' && <div className="h-full overflow-y-auto"><AuthView /></div>}
        {currentView === 'account' && <div className="h-full overflow-y-auto"><AccountView /></div>}
      </main>
      <BugReporter appVersion={appVersion} currentView={currentView} />
    </div>
  )
}
