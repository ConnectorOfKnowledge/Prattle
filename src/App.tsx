import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import DictionaryView from './components/DictionaryView'
import ModesView from './components/ModesView'
import Header from './components/Header'

export default function App() {
  const { currentView, loadAllData, settings } = useAppStore()

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Show loading while data loads
  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center bg-cd-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cd-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-cd-subtle text-sm">Loading VoiceType...</p>
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
      </main>
    </div>
  )
}
