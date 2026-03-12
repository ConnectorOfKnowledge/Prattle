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

export default function App() {
  const { currentView, loadAllData, settings, setUser, setIsCheckingAuth } = useAppStore()
  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    loadAllData()
    window.electronAPI.getAppVersion().then(setAppVersion)

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
        }
      } catch {
        // No session — that's fine, free tier
      } finally {
        setIsCheckingAuth(false)
      }
    }
    checkAuth()

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
          // Navigate to main view after successful login
          useAppStore.getState().setCurrentView('main')
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
