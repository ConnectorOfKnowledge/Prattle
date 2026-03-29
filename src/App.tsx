import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import DictionaryView from './components/DictionaryView'
import ModesView from './components/ModesView'
import LearningView from './components/LearningView'
import HistoryView from './components/HistoryView'
import AuthView from './components/AuthView'
import AccountView from './components/AccountView'
import Header from './components/Header'
import ErrorBoundary from './components/ErrorBoundary'
import { TicketDeckWidget } from 'ticketdeck'
import SubscriptionGate from './components/SubscriptionGate'
import { getSession, getSubscriptionStatus, onAuthStateChange, exchangeOAuthCode } from './services/authService'
import type { SubscriptionResponse, UserProfile } from './types'
import type { Session } from '@supabase/supabase-js'

function mapToUserProfile(session: Session, sub: SubscriptionResponse): UserProfile {
  return {
    id: session.user.id,
    email: session.user.email || '',
    subscriptionStatus: sub.status,
    plan: sub.plan,
    accessType: sub.accessType || 'expired',
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  }
}

const views: Record<string, React.ComponentType> = {
  main: MainView,
  modes: ModesView,
  settings: SettingsView,
  dictionary: DictionaryView,
  learning: LearningView,
  history: HistoryView,
  account: AccountView,
}

export default function App() {
  const { currentView, loadAllData, settings, isAuthenticated, setUser, setIsCheckingAuth, setCurrentView } = useAppStore()
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
          setUser(mapToUserProfile(session, sub))
        } else {
          // No session -- show auth view
          setCurrentView('auth')
        }
      } catch {
        setCurrentView('auth')
      } finally {
        setIsCheckingAuth(false)
      }
    }
    checkAuth()

    // Listen for auth changes (login/logout)
    const cleanupAuth = onAuthStateChange(async (session) => {
      if (session) {
        const sub = await getSubscriptionStatus()
        setUser(mapToUserProfile(session, sub))
        setCurrentView('main')
      } else {
        setUser(null)
        setCurrentView('auth')
      }
    })

    // Listen for OAuth callbacks from the custom protocol handler (prattle://)
    const cleanupOAuth = window.electronAPI.onOAuthCallback(async (url: string) => {
      console.log('[Prattle] OAuth callback received in renderer')
      try {
        const session = await exchangeOAuthCode(url)
        if (session) {
          const sub = await getSubscriptionStatus()
          setUser(mapToUserProfile(session, sub))
          setCurrentView('main')
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

  // Require authentication -- no more free tier bypass
  if (!isAuthenticated || currentView === 'auth') {
    return (
      <div className="h-screen flex flex-col bg-cd-bg overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <AuthView />
        </div>
      </div>
    )
  }

  const ViewComponent = views[currentView] || MainView

  return (
    <div className="h-screen flex flex-col bg-cd-bg overflow-hidden">
      <Header />
      <ErrorBoundary>
        <SubscriptionGate>
          <main className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <ViewComponent />
            </div>
          </main>
        </SubscriptionGate>
      </ErrorBoundary>
      <TicketDeckWidget project="Prattle" position="bottom-left" accentColor="#6366f1" theme="auto" />
    </div>
  )
}
