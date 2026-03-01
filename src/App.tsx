import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import DictionaryView from './components/DictionaryView'
import LearningView from './components/LearningView'
import PromptsView from './components/PromptsView'
import TicketsView from './components/TicketsView'
import Header from './components/Header'
import PlatformSidebar from './components/PlatformSidebar'
import OverlayView from './components/OverlayView'

// Detect if running as overlay window
const isOverlay = new URLSearchParams(window.location.search).get('overlay') === 'true'

export default function App() {
  const { currentView, loadAllData, settings, focusMode, sidebarCollapsed } = useAppStore()

  // If overlay window, render overlay component
  if (isOverlay) return <OverlayView />

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Show loading while data loads
  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading VoiceType...</p>
        </div>
      </div>
    )
  }

  const handlePlatformSelect = (platformId: string) => {
    // Call MainView's handler via window reference
    const handler = (window as any).__handlePlatformSelect
    if (handler) handler(platformId)
  }

  const showSidebar = currentView === 'main' && !focusMode

  return (
    <div className="h-screen flex flex-col bg-surface-50 overflow-hidden">
      {!focusMode && <Header />}
      <div className="flex-1 flex overflow-hidden">
        {showSidebar && <PlatformSidebar onPlatformSelect={handlePlatformSelect} />}
        <main className="flex-1 overflow-hidden">
          {currentView === 'main' && <MainView />}
          {currentView === 'settings' && <div className="h-full overflow-y-auto"><SettingsView /></div>}
          {currentView === 'dictionary' && <div className="h-full overflow-y-auto"><DictionaryView /></div>}
          {currentView === 'learning' && <div className="h-full overflow-y-auto"><LearningView /></div>}
          {currentView === 'prompts' && <div className="h-full overflow-y-auto"><PromptsView /></div>}
          {currentView === 'tickets' && <div className="h-full overflow-y-auto"><TicketsView /></div>}
        </main>
      </div>
    </div>
  )
}
