import { useAppStore } from '../stores/appStore'
import { HiCog6Tooth, HiBookOpen, HiMicrophone, HiAdjustmentsHorizontal, HiUser, HiSparkles } from 'react-icons/hi2'

export default function Header() {
  const { currentView, setCurrentView, user } = useAppStore()

  const navItems = [
    { id: 'main' as const, label: 'Dictate', icon: HiMicrophone },
    { id: 'modes' as const, label: 'Modes', icon: HiAdjustmentsHorizontal },
    { id: 'dictionary' as const, label: 'Dictionary', icon: HiBookOpen },
    { id: 'learning' as const, label: 'Learning', icon: HiSparkles },
    { id: 'settings' as const, label: 'Settings', icon: HiCog6Tooth },
  ]

  return (
    <header className="bg-cd-card border-b border-white/5 px-4 py-2 flex items-center gap-1 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 bg-cd-accent rounded-lg flex items-center justify-center">
          <HiMicrophone className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-cd-text text-sm">Prattle</span>
      </div>

      <nav className="flex items-center gap-0.5 flex-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
              ${currentView === item.id
                ? 'bg-cd-accent/20 text-cd-accent'
                : 'text-cd-subtle hover:text-cd-text hover:bg-white/5'
              }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Account button */}
      <button
        onClick={() => setCurrentView(user ? 'account' : 'auth')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
          ${currentView === 'account' || currentView === 'auth'
            ? 'bg-cd-accent/20 text-cd-accent'
            : 'text-cd-subtle hover:text-cd-text hover:bg-white/5'
          }`}
      >
        <HiUser className="w-4 h-4" />
        <span>{user ? 'Account' : 'Sign In'}</span>
        {user?.subscriptionStatus === 'active' && (
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
        )}
      </button>
    </header>
  )
}
