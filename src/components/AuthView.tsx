import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { signIn, signUp, getSession, getSubscriptionStatus } from '../services/authService'
import { HiMicrophone } from 'react-icons/hi2'

export default function AuthView() {
  const { setUser, setCurrentView } = useAppStore()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
        setConfirmationSent(true)
      } else {
        await signIn(email, password)
        const session = await getSession()
        if (session) {
          const sub = await getSubscriptionStatus()
          setUser({
            id: session.user.id,
            email: session.user.email || email,
            subscriptionStatus: sub.status,
            plan: sub.plan,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          })
        }
        setCurrentView('main')
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => {
    // Continue without account — free/BYOK mode
    setUser(null)
    setCurrentView('main')
  }

  if (confirmationSent) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-6 slide-in">
        <div className="text-center">
          <HiMicrophone className="w-12 h-12 text-cd-accent mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-cd-text mb-2">Check your email</h2>
          <p className="text-sm text-cd-subtle">
            We sent a confirmation link to <strong className="text-cd-text">{email}</strong>.
            Click the link to activate your account, then sign in.
          </p>
        </div>
        <button
          onClick={() => { setConfirmationSent(false); setIsSignUp(false) }}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-cd-accent text-white hover:bg-cd-accent/80 transition-all"
        >
          Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6 slide-in">
      <div className="text-center">
        <HiMicrophone className="w-12 h-12 text-cd-accent mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-cd-text">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h2>
        <p className="text-sm text-cd-subtle mt-1">
          {isSignUp
            ? 'Create an account to unlock the full VoiceType experience'
            : 'Sign in to access your subscription'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-cd-text mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-cd-text mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 rounded-xl px-4 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-cd-accent text-white hover:bg-cd-accent/80 transition-all disabled:opacity-50"
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>
      </form>

      <div className="text-center space-y-3">
        <button
          onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          className="text-sm text-cd-accent hover:underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

        <div className="border-t border-white/10 pt-3">
          <button
            onClick={handleSkip}
            className="text-sm text-cd-subtle hover:text-cd-text transition-colors"
          >
            Continue without account (free tier)
          </button>
          <p className="text-xs text-cd-subtle mt-1">
            Use your own API keys. No account required.
          </p>
        </div>
      </div>
    </div>
  )
}
