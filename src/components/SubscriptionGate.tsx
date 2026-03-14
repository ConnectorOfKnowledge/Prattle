import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiLockClosed } from 'react-icons/hi2'

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, refreshSubscription } = useAppStore()

  // Refresh subscription status on mount and every 5 minutes
  useEffect(() => {
    if (user) {
      refreshSubscription()
      const interval = setInterval(refreshSubscription, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [user?.id])

  if (!user) return null

  const isExpired = user.accessType === 'expired'

  // Show trial info badge
  const trialDaysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  if (isExpired) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
        <HiLockClosed className="w-16 h-16 text-cd-subtle" />
        <div>
          <h2 className="text-xl font-semibold text-cd-text mb-2">Trial Expired</h2>
          <p className="text-sm text-cd-subtle max-w-sm">
            Your 3-day free trial has ended. Subscribe to continue using Prattle's
            voice-to-text features.
          </p>
        </div>
        <button
          onClick={() => {
            window.electronAPI.openExternalUrl('https://voicetype-web.vercel.app/#pricing')
          }}
          className="px-6 py-3 rounded-xl text-sm font-medium bg-cd-accent hover:bg-cd-accent/80 text-white transition-all"
        >
          View Plans & Subscribe
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Trial countdown banner */}
      {user.accessType === 'trial' && trialDaysLeft !== null && (
        <div className="bg-amber-900/30 border-b border-amber-700/50 px-4 py-2 text-center text-sm text-amber-300">
          Free trial: {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} remaining
        </div>
      )}
      {children}
    </>
  )
}
