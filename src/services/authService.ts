import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'

// These are public keys — safe to embed in client code
const SUPABASE_URL = 'https://pkvmpajwqgacyrvlxjfk.supabase.co'  // TODO: Update with VoiceType project URL
const SUPABASE_ANON_KEY = 'TODO_REPLACE_WITH_ANON_KEY'  // TODO: Update with VoiceType project anon key

let supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,  // Not needed in Electron
      },
    })
  }
  return supabase
}

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

export interface SubscriptionInfo {
  status: 'active' | 'canceled' | 'past_due' | 'none'
  plan: 'monthly' | 'annual' | 'free'
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

const PROXY_BASE = 'https://voicetype.app'  // TODO: Update with actual domain

export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  const token = await getAccessToken()
  if (!token) {
    return { status: 'none', plan: 'free' }
  }

  try {
    const response = await fetch(`${PROXY_BASE}/api/auth/subscription`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!response.ok) {
      return { status: 'none', plan: 'free' }
    }

    return await response.json()
  } catch {
    // Network error — assume free tier
    return { status: 'none', plan: 'free' }
  }
}

export async function getCheckoutUrl(priceId: string): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const response = await fetch(`${PROXY_BASE}/api/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId }),
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
    const response = await fetch(`${PROXY_BASE}/api/stripe/portal`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
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
