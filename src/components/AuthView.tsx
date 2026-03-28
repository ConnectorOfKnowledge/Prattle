import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { signInWithGoogle, signIn, signUp } from '../services/authService'
import { HiMicrophone } from 'react-icons/hi2'

export default function AuthView() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(message || 'Failed to start Google sign-in')
      setLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')

    try {
      if (isSignUp) {
        const result = await signUp(email, password)
        if (result.user && !result.session) {
          setError('Check your email for a confirmation link.')
          setLoading(false)
          return
        }
      } else {
        await signIn(email, password)
      }
      // Auth state listener in App.tsx handles the rest
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(message || 'Authentication failed')
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-6 slide-in">
      <div className="text-center">
        <HiMicrophone className="w-12 h-12 text-cd-accent mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-cd-text">
          {isSignUp ? 'Create your Prattle account' : 'Sign in to Prattle'}
        </h2>
        <p className="text-sm text-cd-subtle mt-1">
          {isSignUp
            ? 'Start your free 3-day trial. No credit card required.'
            : 'Sign in to continue using Prattle.'
          }
        </p>
      </div>

      <div className="space-y-4">
        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl text-sm font-medium bg-white text-gray-800 hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-3 focus-visible:ring-2 focus-visible:ring-cd-accent/50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-white/10"></div>
          <span className="text-xs text-cd-subtle">or</span>
          <div className="flex-1 border-t border-white/10"></div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="input-field text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="input-field text-sm"
          />
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 rounded-xl px-4 py-2">{error}</p>
        )}

        {loading && !error && (
          <p className="text-xs text-cd-subtle text-center">
            {isSignUp ? '' : 'Complete the sign-in in your browser if prompted.'}
          </p>
        )}
      </div>

      <div className="border-t border-white/10 pt-4 text-center">
        <button
          onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          className="text-sm text-cd-subtle hover:text-cd-text transition-colors focus-visible:ring-2 focus-visible:ring-cd-accent/50 rounded-lg px-2 py-1"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up free"}
        </button>
      </div>
    </div>
  )
}
