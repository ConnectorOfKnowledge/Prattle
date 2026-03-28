import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { signOut, getCheckoutUrl, getPortalUrl } from '../services/authService'
import { HiUser, HiCreditCard, HiArrowRightOnRectangle, HiSparkles } from 'react-icons/hi2'

export default function AccountView() {
  const { user, setUser, setCurrentView } = useAppStore()
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  const handleUpgrade = async (plan: 'monthly' | 'annual') => {
    setLoading(plan)
    setError('')
    try {
      // FIXME: Replace with actual Stripe price IDs before enabling payments
      const priceId = plan === 'monthly'
        ? 'price_MONTHLY_TODO'
        : 'price_ANNUAL_TODO'

      if (priceId.includes('TODO')) {
        setError('Subscription setup in progress. Please try again later.')
        setLoading('')
        return
      }

      const url = await getCheckoutUrl(priceId)
      if (url) {
        await window.electronAPI.openExternalUrl(url)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Unable to start checkout: ${message}`)
    } finally {
      setLoading('')
    }
  }

  const handleManageSubscription = async () => {
    setLoading('portal')
    setError('')
    try {
      const url = await getPortalUrl()
      if (url) {
        await window.electronAPI.openExternalUrl(url)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Unable to open subscription portal: ${message}`)
    } finally {
      setLoading('')
    }
  }

  const handleSignOut = async () => {
    setError('')
    try {
      await signOut()
      setUser(null)
      setCurrentView('auth')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Sign out failed: ${message}`)
    }
  }

  if (!user) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4 slide-in">
        <p className="text-cd-subtle">You're using Prattle in free mode.</p>
        <button
          onClick={() => setCurrentView('auth')}
          className="btn-primary"
        >
          Sign In or Create Account
        </button>
      </div>
    )
  }

  const isFamily = user.plan === 'family' || user.accessType === 'family'
  const isActive = user.subscriptionStatus === 'active'
  const isPastDue = user.subscriptionStatus === 'past_due'

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <h2 className="text-lg font-semibold text-cd-text">Account</h2>

      {/* Error display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* User info */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cd-accent/20 flex items-center justify-center">
            <HiUser className="w-5 h-5 text-cd-accent" />
          </div>
          <div>
            <div className="text-sm font-medium text-cd-text">{user.email}</div>
            <div className="text-xs text-cd-subtle">
              {isFamily
                ? 'Family plan'
                : isActive
                  ? `${user.plan === 'annual' ? 'Annual' : 'Monthly'} plan`
                  : 'Free tier'}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription status */}
      <div className="card">
        <h3 className="font-medium text-cd-text mb-3 flex items-center gap-2">
          <HiCreditCard className="w-4 h-4" />
          Subscription
        </h3>

        {isFamily ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-cd-text">Status</span>
              <span className="text-sm font-medium text-green-400">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-cd-text">Plan</span>
              <span className="text-sm font-medium text-cd-text">Family</span>
            </div>
            <p className="text-xs text-cd-subtle bg-cd-bg rounded-lg px-3 py-2">
              You have full access to Prattle through the family plan. No subscription management needed.
            </p>
          </div>
        ) : isActive ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-cd-text">Status</span>
              <span className="text-sm font-medium text-green-400">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-cd-text">Plan</span>
              <span className="text-sm font-medium text-cd-text">
                {user.plan === 'annual' ? '$69.95/year' : '$9.95/month'}
              </span>
            </div>
            {user.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-cd-text">
                  {user.cancelAtPeriodEnd ? 'Expires' : 'Renews'}
                </span>
                <span className="text-sm text-cd-subtle">
                  {new Date(user.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
            {user.cancelAtPeriodEnd && (
              <p className="text-xs text-amber-400 bg-amber-900/20 rounded-lg px-3 py-2">
                Your subscription will end at the current period. You can resubscribe anytime.
              </p>
            )}
            <button
              onClick={handleManageSubscription}
              disabled={loading === 'portal'}
              className="btn-secondary w-full"
            >
              {loading === 'portal' ? 'Opening...' : 'Manage Subscription'}
            </button>
          </div>
        ) : isPastDue ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-400">
              Your payment failed. Please update your payment method to continue.
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={loading === 'portal'}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cd-accent/50"
            >
              {loading === 'portal' ? 'Opening...' : 'Update Payment'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-cd-subtle">
              Upgrade to get rid of API key management. We handle everything -- just speak and type.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleUpgrade('monthly')}
                disabled={!!loading}
                className="flex flex-col items-center gap-1 p-4 rounded-xl border border-white/10 hover:border-cd-accent/50 hover:bg-cd-accent/5 transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cd-accent/50"
              >
                <span className="text-lg font-bold text-cd-text">$9.95</span>
                <span className="text-xs text-cd-subtle">per month</span>
                {loading === 'monthly' && <span className="text-xs text-cd-accent">Opening...</span>}
              </button>

              <button
                onClick={() => handleUpgrade('annual')}
                disabled={!!loading}
                className="flex flex-col items-center gap-1 p-4 rounded-xl border border-cd-accent/50 bg-cd-accent/5 hover:bg-cd-accent/10 transition-all disabled:opacity-50 relative focus-visible:ring-2 focus-visible:ring-cd-accent/50"
              >
                <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-cd-accent text-white text-[10px] font-bold">
                  SAVE 42%
                </div>
                <span className="text-lg font-bold text-cd-text">$69.95</span>
                <span className="text-xs text-cd-subtle">per year</span>
                {loading === 'annual' && <span className="text-xs text-cd-accent">Opening...</span>}
              </button>
            </div>

            <p className="text-xs text-cd-subtle text-center">
              <HiSparkles className="inline w-3 h-3 mr-1" />
              Both plans include unlimited dictation and AI processing
            </p>
          </div>
        )}
      </div>

      {/* Sign out */}
      <div className="card">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors focus-visible:ring-2 focus-visible:ring-cd-accent/50 rounded-lg px-1"
        >
          <HiArrowRightOnRectangle className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
