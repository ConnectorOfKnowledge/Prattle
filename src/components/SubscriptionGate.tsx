import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiLockClosed } from 'react-icons/hi2'
import { getAccessToken } from '../services/authService'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

const PROXY_BASE = 'https://prattle.app'

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, refreshSubscription } = useAppStore()
  const [promoCode, setPromoCode] = useState('')
  const [promoStatus, setPromoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [promoMessage, setPromoMessage] = useState('')

  // Refresh subscription status on mount and every 5 minutes
  useEffect(() => {
    if (user) {
      refreshSubscription()
      const interval = setInterval(refreshSubscription, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [user?.id])

  const handlePromoSubmit = async () => {
    if (!promoCode.trim()) return

    setPromoStatus('loading')
    setPromoMessage('')

    try {
      const token = await getAccessToken()
      if (!token) {
        setPromoStatus('error')
        setPromoMessage('Not authenticated. Please restart the app.')
        return
      }

      const response = await fetchWithTimeout(`${PROXY_BASE}/api/auth/promo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: promoCode.trim() }),
        timeout: 15000,
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setPromoStatus('success')
        setPromoMessage(result.message)
        // Refresh subscription to pick up the new trial period
        setTimeout(() => refreshSubscription(), 1000)
      } else {
        setPromoStatus('error')
        setPromoMessage(result.error || 'Invalid promo code')
      }
    } catch (err: any) {
      setPromoStatus('error')
      setPromoMessage('Could not verify code. Check your connection.')
    }
  }

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
            window.electronAPI.openExternalUrl('https://prattle.app/#pricing')
          }}
          className="px-6 py-3 rounded-xl text-sm font-medium bg-cd-accent hover:bg-cd-accent/80 text-white transition-all"
        >
          View Plans & Subscribe
        </button>

        {/* Promo code section */}
        <div className="w-full max-w-xs space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-cd-border" />
            <span className="text-xs text-cd-subtle">or enter a promo code</span>
            <div className="flex-1 h-px bg-cd-border" />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase())
                if (promoStatus !== 'idle') {
                  setPromoStatus('idle')
                  setPromoMessage('')
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && handlePromoSubmit()}
              placeholder="PROMO CODE"
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-cd-bg-secondary border border-cd-border text-cd-text placeholder-cd-subtle text-center tracking-widest font-mono focus:outline-none focus:border-cd-accent"
              disabled={promoStatus === 'loading'}
            />
            <button
              onClick={handlePromoSubmit}
              disabled={promoStatus === 'loading' || !promoCode.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-cd-bg-secondary border border-cd-border text-cd-text hover:bg-cd-bg-tertiary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {promoStatus === 'loading' ? '...' : 'Apply'}
            </button>
          </div>
          {promoMessage && (
            <p className={`text-xs ${promoStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {promoMessage}
            </p>
          )}
        </div>
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
