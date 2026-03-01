import { useAppStore } from '../stores/appStore'
import { HiCog6Tooth, HiBookOpen, HiAcademicCap, HiChatBubbleBottomCenterText, HiMicrophone, HiClipboardDocumentList } from 'react-icons/hi2'

export default function Header() {
  const { currentView, setCurrentView } = useAppStore()

  const navItems = [
    { id: 'main' as const, label: 'Dictate', icon: HiMicrophone },
    { id: 'prompts' as const, label: 'Platforms', icon: HiChatBubbleBottomCenterText },
    { id: 'dictionary' as const, label: 'Dictionary', icon: HiBookOpen },
    { id: 'learning' as const, label: 'Learning', icon: HiAcademicCap },
    { id: 'tickets' as const, label: 'Tickets', icon: HiClipboardDocumentList },
    { id: 'settings' as const, label: 'Settings', icon: HiCog6Tooth },
  ]

  return (
    <header className="bg-white border-b border-surface-200 px-4 py-2 flex items-center gap-1 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center">
          <HiMicrophone className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800 text-sm">VoiceType</span>
      </div>

      <nav className="flex items-center gap-0.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
              ${currentView === item.id
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-surface-100'
              }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  )
}
