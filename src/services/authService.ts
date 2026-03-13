import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

// Shared Supabase project (same as BrainLink, TicketDeck, etc.)
// These are public keys -- safe to embed in client code
const SUPABASE_URL = 'https://dgnikbbugiuuwokwenlm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbmlrYmJ1Z2l1dXdva3dlbmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NjQ1NTYsImV4cCI6MjA4ODE0MDU1Nn0.CHnKyacly6oFjSpcdXNEdUJ2eyt0u8JfS1BBh-WmED8'

let supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Enable URL detection so exchangeCodeForSession works when we
        // feed it the callback URL from the custom protocol handler
        detectSessionInUrl: true,
      },
    })
  }
  return supabase
}

// --- Google OAuth (primary login method) ---

/**
 * Start Google OAuth flow.
 * Opens the system browser to Google's consent screen.
 * After login, Google redirects to prattle://auth/callback with a code.
 * The Electron main process catches that via the custom protocol handler
 * and sends the full URL back to the renderer for session exchange.
 */
export async function signInWithGoogle() {
  const sb = getSupabase()

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'prattle://auth/callback',
      skipBrowserRedirect: true, // Don't let Supabase try to redirect in-page
    },
  })

  if (error) throw error

  // Open the OAuth URL in the user's default browser
  if (data.url) {
    await window.electronAPI.openExternalUrl(data.url)
  }

  return data
}

/**
 * Exchange an OAuth callback URL for a session.
 * Called when the Electron main process receives the prattle:// protocol callback.
 */
export async function exchangeOAuthCode(callbackUrl: string): Promise<Session | null> {
  const sb = getSupabase()

  // Parse the URL to extract the code
  // Supabase callback URLs look like: prattle://auth/callback#access_token=...&refresh_token=...
  // OR with PKCE: prattle://auth/callback?code=...
  const url = new URL(callbackUrl)

  // Check for PKCE code flow (query param)
  const code = url.searchParams.get('code')
  if (code) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code)
    if (error) throw error
    return data.session
  }

  // Check for implicit flow (hash fragment with access_token)
  // Hash fragments come as: #access_token=...&token_type=...&refresh_token=...
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (accessToken && refreshToken) {
      const { data, error } = await sb.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) throw error
      return data.session
    }
  }

  return null
}

// --- Legacy email/password (keeping for backwards compatibility) ---

export async function signUp(email: string, password: string) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// --- Session management ---

export async function signOut() {
  const sb = getSupabase()
  const { error } = await sb.auth.signOut()
  if (error) throw error
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase()
  const { data: { session } } = await sb.auth.getSession()
  return session
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token || null
}

// --- Subscription (for future paid tier) ---

export interface SubscriptionInfo {
  status: 'active' | 'canceled' | 'past_due' | 'none'
  plan: 'monthly' | 'annual' | 'free'
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

const PROXY_BASE = 'https://prattle.app'  // TODO: Update with actual domain

export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  const token = await getAccessToken()
  if (!token) {
    return { status: 'none', plan: 'free' }
  }

  try {
    const response = await fetchWithTimeout(`${PROXY_BASE}/api/auth/subscription`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 5000,
    })

    if (!response.ok) {
      return { status: 'none', plan: 'free' }
    }

    return await response.json()
  } catch {
    // Network error -- assume free tier
    return { status: 'none', plan: 'free' }
  }
}

export async function getCheckoutUrl(priceId: string): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const response = await fetchWithTimeout(`${PROXY_BASE}/api/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId }),
      timeout: 5000,
    })

    if (!response.ok) return null
    const { url } = await response.json()
    return url
  } catch {
    return null
  }
}

export async function getPortalUrl(): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const response = await fetchWithTimeout(`${PROXY_BASE}/api/stripe/portal`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 5000,
    })

    if (!response.ok) return null
    const { url } = await response.json()
    return url
  } catch {
    return null
  }
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const sb = getSupabase()
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => subscription.unsubscribe()
}
