import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiCog6Tooth, HiBookOpen, HiMicrophone, HiAdjustmentsHorizontal, HiUser, HiSparkles, HiBars3, HiDocumentText } from 'react-icons/hi2'

export default function Header() {
  const { currentView, setCurrentView, user, settings } = useAppStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const navItems = [
    { id: 'main' as const, label: 'Dictate', icon: HiMicrophone },
    { id: 'modes' as const, label: 'Modes', icon: HiAdjustmentsHorizontal },
    { id: 'history' as const, label: 'History', icon: HiDocumentText },
    { id: 'dictionary' as const, label: 'Dictionary', icon: HiBookOpen },
    ...(settings?.trainingEnabled ? [{ id: 'learning' as const, label: 'Learning', icon: HiSparkles }] : []),
    { id: 'settings' as const, label: 'Settings', icon: HiCog6Tooth },
    { id: user ? 'account' as const : 'auth' as const, label: user ? 'Account' : 'Sign In', icon: HiUser },
  ]

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Get current view label for the header
  const currentLabel = navItems.find(item => item.id === currentView)?.label || 'Prattle'

  return (
    <header className="bg-cd-card border-b border-white/5 px-4 py-2 flex items-center gap-3 shrink-0">
      {/* Logo + app name */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-cd-accent rounded-lg flex items-center justify-center">
          <HiMicrophone className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-cd-text text-sm">Prattle</span>
      </div>

      {/* Current view label */}
      <span className="text-xs text-cd-subtle font-medium">{currentLabel}</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Subscription indicator */}
      {user?.subscriptionStatus === 'active' && (
        <span className="w-2 h-2 rounded-full bg-green-400" title="Active subscription"></span>
      )}

      {/* Hamburger menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`p-2 rounded-lg transition-all duration-150 ${
            menuOpen ? 'bg-cd-accent/20 text-cd-accent' : 'text-cd-subtle hover:text-cd-text hover:bg-white/5'
          }`}
        >
          <HiBars3 className="w-5 h-5" />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-cd-card border border-white/10 rounded-xl shadow-xl shadow-black/40 py-1 z-50">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id)
                  setMenuOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-100
                  ${currentView === item.id
                    ? 'bg-cd-accent/15 text-cd-accent'
                    : 'text-cd-subtle hover:text-cd-text hover:bg-white/5'
                  }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
