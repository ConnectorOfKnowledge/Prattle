# Prattle Subscription Architecture - Phase 1: Auth Lockdown + Proxy Routing

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Prattle from a BYOK (bring-your-own-key) developer tool to an authenticated, proxy-routed service where all API calls flow through the prattle-web backend -- with a 3-day free trial that locks the app completely when expired.

**Architecture:** Desktop app requires auth on launch (Google OAuth or email/password). All speech-to-text and LLM calls route through prattle-web proxy endpoints (API keys live server-side only). Trial countdown is server-side to prevent clock manipulation. WebSocket streaming for Deepgram is proxied through a new backend endpoint.

**Tech Stack:** Electron 34 + React 18 + TypeScript + Zustand (desktop), Next.js 16 + Supabase + Stripe (backend), Deepgram Nova-3 (STT), Claude/Gemini/OpenAI (LLM)

**Two Codebases:**
- Desktop: `C:\Dev\prattle`
- Backend: `C:\Dev\prattle-web`

---

## Chunk 1: Backend - Trial System + Auth Hardening

### Task 1: Add trial_ends_at to profiles table

**Context:** The `profiles` table (Supabase, shared DB `dgnikbbugiuuwokwenlm`) needs a `trial_ends_at` column. The `handle_new_user()` trigger auto-creates profiles on signup -- it needs to set the trial end date to 3 days from signup.

**Files:**
- Create: `C:\Dev\prattle-web\supabase\migration-002-trial.sql`
- Modify: `C:\Dev\prattle-web\src\lib\supabase.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 002: Add trial support to profiles
-- Run in Supabase SQL Editor

-- Add trial columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_family BOOLEAN DEFAULT FALSE;

-- Update the trigger to set trial_ends_at on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, trial_ends_at)
  VALUES (NEW.id, NEW.email, NOW() + INTERVAL '3 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- For existing users who don't have trial_ends_at set,
-- give them a fresh 3-day trial from now
UPDATE public.profiles
SET trial_ends_at = NOW() + INTERVAL '3 days'
WHERE trial_ends_at IS NULL AND is_family IS NOT TRUE;
```

Save to `C:\Dev\prattle-web\supabase\migration-002-trial.sql`.

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Navigate to Supabase Dashboard > SQL Editor > New Query, paste and run.
Expected: Success, profiles table now has `trial_ends_at` and `is_family` columns.

- [ ] **Step 3: Add checkAccess helper to supabase.ts**

This replaces the simple `checkSubscription` with a combined check: active subscription OR within trial period OR family account.

Add to `C:\Dev\prattle-web\src\lib\supabase.ts` after the existing `checkSubscription` function:

```typescript
// Check if user has access (active subscription, valid trial, or family account)
export async function checkAccess(userId: string): Promise<{
  allowed: boolean
  reason: 'subscription' | 'trial' | 'family' | 'expired'
  trialEndsAt?: string
  subscription?: any
}> {
  // Check family flag first
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('trial_ends_at, is_family')
    .eq('id', userId)
    .single()

  if (profile?.is_family) {
    return { allowed: true, reason: 'family' }
  }

  // Check active subscription
  const subscription = await checkSubscription(userId)
  if (subscription) {
    return { allowed: true, reason: 'subscription', subscription }
  }

  // Check trial
  if (profile?.trial_ends_at) {
    const trialEnd = new Date(profile.trial_ends_at)
    if (trialEnd > new Date()) {
      return {
        allowed: true,
        reason: 'trial',
        trialEndsAt: profile.trial_ends_at,
      }
    }
  }

  return { allowed: false, reason: 'expired' }
}
```

- [ ] **Step 4: Commit**

```bash
cd C:\Dev\prattle-web
git add supabase/migration-002-trial.sql src/lib/supabase.ts
git commit -m "feat: add trial system with 3-day server-side countdown and family accounts"
```

---

### Task 2: Update proxy endpoints to use checkAccess instead of checkSubscription

**Context:** Currently, `/api/speech/transcribe` and `/api/llm/process` and `/api/llm/chat` all require an active subscription (`checkSubscription`). They need to accept trial users and family accounts too.

**Files:**
- Modify: `C:\Dev\prattle-web\src\app\api\speech\transcribe\route.ts:14-18`
- Modify: `C:\Dev\prattle-web\src\app\api\llm\process\route.ts:14-18`
- Modify: `C:\Dev\prattle-web\src\app\api\llm\chat\route.ts:14-18` (same pattern)

- [ ] **Step 1: Update speech transcribe route**

In `C:\Dev\prattle-web\src\app\api\speech\transcribe\route.ts`:

Change import:
```typescript
import { verifyUser, checkAccess, checkRateLimit, logUsage } from '@/lib/supabase'
```

Replace the subscription check block (lines 14-18):
```typescript
    // 2. Check access (subscription, trial, or family)
    const access = await checkAccess(user.id)
    if (!access.allowed) {
      return NextResponse.json(
        { error: 'Trial expired. Subscribe to continue using Prattle.', code: 'TRIAL_EXPIRED' },
        { status: 403 }
      )
    }
```

- [ ] **Step 2: Update Deepgram model to nova-3**

In the same file, line 88, change `nova-2` to `nova-3`:
```typescript
    'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true',
```

- [ ] **Step 3: Update LLM process route**

Same pattern in `C:\Dev\prattle-web\src\app\api\llm\process\route.ts` -- change import and replace subscription check.

- [ ] **Step 4: Update LLM chat route**

Same pattern in `C:\Dev\prattle-web\src\app\api\llm\chat\route.ts`.

- [ ] **Step 5: Commit**

```bash
cd C:\Dev\prattle-web
git add src/app/api/speech/transcribe/route.ts src/app/api/llm/process/route.ts src/app/api/llm/chat/route.ts
git commit -m "feat: accept trial and family users in all proxy endpoints"
```

---

### Task 3: Update subscription status endpoint to include trial info

**Context:** The desktop app calls `GET /api/auth/subscription` to check user status. It needs to return trial info so the app can show "Trial: X days remaining".

**Files:**
- Modify: `C:\Dev\prattle-web\src\app\api\auth\subscription\route.ts`

- [ ] **Step 1: Rewrite the subscription endpoint**

Replace the entire route handler:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser, checkAccess } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await checkAccess(user.id)

    if (access.reason === 'subscription' && access.subscription) {
      return NextResponse.json({
        status: access.subscription.status,
        plan: access.subscription.plan,
        currentPeriodEnd: access.subscription.current_period_end,
        cancelAtPeriodEnd: access.subscription.cancel_at_period_end,
        accessType: 'subscription',
      })
    }

    if (access.reason === 'trial') {
      return NextResponse.json({
        status: 'trial',
        plan: 'trial',
        trialEndsAt: access.trialEndsAt,
        accessType: 'trial',
      })
    }

    if (access.reason === 'family') {
      return NextResponse.json({
        status: 'active',
        plan: 'family',
        accessType: 'family',
      })
    }

    // Expired
    return NextResponse.json({
      status: 'expired',
      plan: 'none',
      accessType: 'expired',
    })
  } catch (error: any) {
    console.error('Subscription check error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Dev\prattle-web
git add src/app/api/auth/subscription/route.ts
git commit -m "feat: return trial/family status from subscription endpoint"
```

---

### Task 4: Add WebSocket streaming proxy endpoint

**Context:** Currently the desktop app connects directly to `wss://api.deepgram.com` with the user's API key. We need a proxy that:
1. Accepts an authenticated WebSocket from the desktop app
2. Opens a Deepgram WebSocket server-side with our API key
3. Forwards audio chunks client->Deepgram and transcript results Deepgram->client

Next.js doesn't natively support WebSocket upgrade in API routes. We need a custom server or use Vercel's Edge Runtime with a different approach.

**Recommended approach:** Use an HTTP-based streaming proxy instead of raw WebSocket. The desktop app sends audio chunks via a long-lived POST request, and receives transcript updates via Server-Sent Events (SSE). This works on Vercel without a custom server.

**Alternative approach (simpler, recommended for v1):** Keep the desktop app connecting directly to Deepgram for streaming, but use a short-lived token exchange. The desktop app requests a temporary Deepgram API key from the proxy (valid for one session), which the proxy generates or the proxy just returns the key encrypted for the session.

**Simplest approach (recommended):** The desktop app calls a new `/api/speech/stream-token` endpoint that verifies auth + access, then returns a temporary Deepgram API key. Deepgram doesn't support scoped/temporary keys, so this endpoint returns the real key but only to authenticated users with active access. The key is held in memory only, never persisted client-side.

**Files:**
- Create: `C:\Dev\prattle-web\src\app\api\speech\stream-token\route.ts`

- [ ] **Step 1: Create the stream token endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser, checkAccess, logUsage } from '@/lib/supabase'

// Returns a Deepgram API key for authenticated users with active access.
// The desktop app uses this for WebSocket streaming connections.
// Key is held in memory only -- never persisted to disk on the client.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await checkAccess(user.id)
    if (!access.allowed) {
      return NextResponse.json(
        { error: 'Trial expired. Subscribe to continue.', code: 'TRIAL_EXPIRED' },
        { status: 403 }
      )
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY
    if (!deepgramKey) {
      return NextResponse.json({ error: 'Speech service not configured' }, { status: 500 })
    }

    // Log usage
    await logUsage(user.id, 'speech_stream_session')

    return NextResponse.json({ token: deepgramKey })
  } catch (error: any) {
    console.error('Stream token error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Dev\prattle-web
git add src/app/api/speech/stream-token/route.ts
git commit -m "feat: add stream-token endpoint for proxied Deepgram WebSocket auth"
```

---

## Chunk 2: Desktop App - Auth Lockdown

### Task 5: Update types for new subscription model

**Context:** The desktop app needs updated types to handle trial status, family accounts, and the removal of API keys from settings.

**Files:**
- Modify: `C:\Dev\prattle\src\types\index.ts`

- [ ] **Step 1: Update UserProfile and SubscriptionInfo types**

```typescript
export interface UserProfile {
  id: string
  email: string
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'canceled' | 'past_due' | 'none'
  plan: 'monthly' | 'annual' | 'family' | 'trial' | 'none'
  accessType: 'subscription' | 'trial' | 'family' | 'expired'
  trialEndsAt?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}
```

Note: Keep the `apiKeys` field in Settings for now (don't delete it yet) to avoid breaking the settings file on disk for existing users. We'll just stop showing the UI and stop reading from it.

- [ ] **Step 2: Commit**

```bash
cd C:\Dev\prattle
git add src/types/index.ts
git commit -m "feat: update UserProfile type for trial/family/subscription access"
```

---

### Task 6: Update PROXY_BASE URLs

**Context:** Both `authService.ts` and `proxyService.ts` have `PROXY_BASE = 'https://prattle.app'` which is a TODO placeholder. It needs to point to the actual Vercel deployment URL.

**Files:**
- Modify: `C:\Dev\prattle\src\services\authService.ts:140`
- Modify: `C:\Dev\prattle\src\services\proxyService.ts:4`

- [ ] **Step 1: Update both files**

Change `PROXY_BASE` in both files to:
```typescript
const PROXY_BASE = 'https://voicetype-web.vercel.app'
```

(This is the current Vercel URL. When the domain prattle.app is set up, we'll update it.)

- [ ] **Step 2: Increase proxy timeout**

In `proxyService.ts`, the timeout is 5000ms (5 seconds). Speech transcription of long audio can take much longer. Update all `timeout` values:

- `transcribeViaProxy`: `timeout: 60000` (60 seconds -- audio can be long)
- `processTextViaProxy`: `timeout: 30000` (30 seconds)
- `chatViaProxy`: `timeout: 30000` (30 seconds)

- [ ] **Step 3: Commit**

```bash
cd C:\Dev\prattle
git add src/services/authService.ts src/services/proxyService.ts
git commit -m "fix: point PROXY_BASE to actual Vercel URL and increase timeouts"
```

---

### Task 7: Remove "Skip" button and add email/password auth

**Context:** AuthView.tsx currently has a "Continue without account (free tier)" button that bypasses auth entirely. This must be removed. Email/password signup must be added alongside Google OAuth.

**Files:**
- Modify: `C:\Dev\prattle\src\components\AuthView.tsx`

- [ ] **Step 1: Rewrite AuthView with email/password + Google OAuth**

Replace the entire AuthView component:

```tsx
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
    } catch (err: any) {
      setError(err.message || 'Failed to start Google sign-in')
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
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
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
          className="w-full py-3 px-4 rounded-xl text-sm font-medium bg-white text-gray-800 hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
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
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-medium bg-cd-accent hover:bg-cd-accent/80 text-white transition-all disabled:opacity-50"
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
          className="text-sm text-cd-subtle hover:text-cd-text transition-colors"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up free"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Dev\prattle
git add src/components/AuthView.tsx
git commit -m "feat: replace skip-auth with email/password signup + remove BYOK bypass"
```

---

### Task 8: Remove API key UI from Settings

**Context:** SettingsView.tsx has a full API Keys section (lines 141-182) with four input fields for OpenAI, Gemini, Claude, and Deepgram keys. This entire section must be removed. The speech/LLM provider selectors should also be simplified since the user no longer chooses a provider (the backend handles it).

**Files:**
- Modify: `C:\Dev\prattle\src\components\SettingsView.tsx`

- [ ] **Step 1: Remove the API Keys section**

Delete the entire API Keys card (lines 141-182 -- the `<div>` containing "API Keys" header through the closing `</div>`).

- [ ] **Step 2: Remove the updateApiKey function and showKeys state**

Remove:
- `const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})`
- The `updateApiKey` function
- The `toggleShowKey` function
- The `maskKey` function

- [ ] **Step 3: Simplify provider selectors**

Remove the Speech Provider and LLM Provider selector cards entirely. The backend decides which provider to use. Replace with a simple info card:

```tsx
{/* Service Info */}
<div className="bg-cd-card rounded-2xl border border-white/5 p-5">
  <h3 className="font-medium text-cd-text mb-2">Speech & AI Processing</h3>
  <p className="text-sm text-cd-subtle">
    Prattle uses Deepgram Nova-3 for speech recognition and AI models for text processing.
    All processing is handled securely through Prattle's servers.
  </p>
</div>
```

- [ ] **Step 4: Commit**

```bash
cd C:\Dev\prattle
git add src/components/SettingsView.tsx
git commit -m "feat: remove API key UI and provider selectors from settings"
```

---

## Chunk 3: Desktop App - Route All Calls Through Proxy

### Task 9: Update proxyService to handle streaming token

**Context:** The desktop app needs a new function to request a Deepgram streaming token from the proxy, then use that token for WebSocket connections.

**Files:**
- Modify: `C:\Dev\prattle\src\services\proxyService.ts`

- [ ] **Step 1: Add getStreamToken function**

Add to `proxyService.ts`:

```typescript
/**
 * Get a Deepgram streaming token from the proxy (authenticated users only)
 */
export async function getStreamToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/speech/stream-token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to get stream token' }))
    if (err.code === 'TRIAL_EXPIRED') {
      throw new Error('TRIAL_EXPIRED')
    }
    throw new Error(err.error || `Stream token error: ${response.status}`)
  }

  const result = await response.json()
  return result.token
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Dev\prattle
git add src/services/proxyService.ts
git commit -m "feat: add getStreamToken for proxied Deepgram WebSocket auth"
```

---

### Task 10: Rewrite MainView to route everything through proxy

**Context:** MainView.tsx currently has two code paths: "paid tier" (proxy) and "free tier" (direct API calls with user's keys). We need to collapse these into a single path: everything goes through the proxy. The streaming setup also needs to use `getStreamToken()` instead of reading from `settings.apiKeys.deepgram`.

**Files:**
- Modify: `C:\Dev\prattle\src\components\MainView.tsx`

- [ ] **Step 1: Remove direct API call imports**

Change the imports. Remove direct transcription functions, keep proxy functions:

```typescript
import { speechService, isHallucinatedPhrase } from '../services/speechService'
import { deepgramStreamService } from '../services/deepgramStreamService'
import { buildProcessPrompt, buildRewritePrompt } from '../services/llmService'
import { transcribeViaProxy, processTextViaProxy, getStreamToken } from '../services/proxyService'
```

Remove from import: `transcribeWithWhisper, transcribeWithDeepgram, transcribeWithGemini, transcribeWithBrowser, stopBrowserTranscription`

- [ ] **Step 2: Remove the hasSpeechKey / hasLlmKey setup warnings**

Delete lines 556-560 (the `hasSpeechKey` and `hasLlmKey` calculations) and lines 588-599 (the two warning `<div>`s in the JSX). Users no longer need API keys.

- [ ] **Step 3: Update startRecordingInternal streaming setup**

In `startRecordingInternal`, replace the streaming setup block (lines 136-168). Instead of checking `settings.apiKeys.deepgram`, get a stream token from the proxy:

```typescript
        // Set up Deepgram WebSocket streaming (not for rewrite or browser provider)
        isStreamingRef.current = false

        if (settings.speechProvider === 'deepgram' && !rewrite) {
          try {
            const streamToken = await getStreamToken()
            const sampleRate = speechService.startPcmCapture((buffer) => {
              deepgramStreamService.sendAudio(buffer)
            })

            await deepgramStreamService.start(
              streamToken,
              sampleRate,
              (text, _isFinal) => {
                setEditedText(text)
              },
              (error) => {
                console.error('[Prattle] Deepgram stream error:', error)
                isStreamingRef.current = false
                speechService.stopPcmCapture()
              }
            )
            isStreamingRef.current = true
          } catch (e: any) {
            if (e.message === 'TRIAL_EXPIRED') {
              setStatusMessage('Trial expired. Subscribe to continue using Prattle.')
              setRecordingState('idle')
              return
            }
            console.warn('[Prattle] Streaming failed, will use batch:', e)
            speechService.stopPcmCapture()
            isStreamingRef.current = false
          }
        }
```

- [ ] **Step 4: Update stopRecordingInternal to use proxy for all transcription**

Replace the transcription section (the big if/else block after the streaming check). Remove all direct API call paths:

```typescript
      if (isStreamingRef.current) {
        // Deepgram WebSocket streaming -- transcript accumulated in real-time
        speechService.stopPcmCapture()
        await speechService.stopRecording()
        transcription = await deepgramStreamService.stop()
        isStreamingRef.current = false
      } else {
        // Batch transcription via proxy
        const audioBlob = await speechService.stopRecording()
        transcription = await transcribeViaProxy(audioBlob, settings.speechProvider)
      }
```

Remove the `isPaidUser` check and all the direct API key paths (`settings.apiKeys.gemini`, etc.).

- [ ] **Step 5: Update text processing to always use proxy**

Replace the LLM processing section. Remove the `isPaidUser` branching:

For normal dictation:
```typescript
        const promptData = buildProcessPrompt(
          transcription, modeIndex,
          dictionary || { replacements: {} },
          learnedPatterns?.patterns || [],
          settings
        )
        if (promptData) {
          finalText = await processTextViaProxy(
            promptData.userMessage, promptData.systemPrompt, settings.llmProvider
          )
        } else {
          finalText = transcription
        }
```

For rewrite:
```typescript
        const { systemPrompt, userMessage } = buildRewritePrompt(currentCommitted, transcription)
        rewritten = await processTextViaProxy(userMessage, systemPrompt, settings.llmProvider)
```

- [ ] **Step 6: Handle TRIAL_EXPIRED errors**

Add a catch for TRIAL_EXPIRED in the main try/catch of `stopRecordingInternal`:

```typescript
    } catch (error: any) {
      console.error('Transcription/processing error:', error)
      if (error.message === 'TRIAL_EXPIRED' || error.message?.includes('Trial expired')) {
        setStatusMessage('Your trial has expired. Subscribe to continue using Prattle.')
      } else if (error.message === 'Not authenticated') {
        setStatusMessage('Please sign in to use Prattle.')
        useAppStore.getState().setCurrentView('auth')
      } else {
        setStatusMessage(`Error: ${error.message}`)
      }
    }
```

- [ ] **Step 7: Commit**

```bash
cd C:\Dev\prattle
git add src/components/MainView.tsx
git commit -m "feat: route all transcription and LLM calls through proxy, remove direct API paths"
```

---

### Task 11: Update LLM service to remove direct API calls from non-proxy paths

**Context:** `llmService.ts` still exports `processText`, `rewriteText`, `chatWithAI` etc. that make direct API calls. Now that MainView always uses the proxy, the direct-call functions (`callGemini`, `callClaude`, `callOpenAI` and their chat variants) are dead code. However, `analyzeEdits` and `revisePrompt` also use direct calls. These need to go through the proxy too.

**Files:**
- Modify: `C:\Dev\prattle\src\services\llmService.ts`

- [ ] **Step 1: Update analyzeEdits to use proxy**

Replace the switch statement in `analyzeEdits` with a proxy call:

```typescript
import { processTextViaProxy } from './proxyService'

// In analyzeEdits, replace the try block:
  try {
    const systemPrompt = 'You are a text analysis assistant. Respond only with valid JSON or the word null.'
    const response = await processTextViaProxy(prompt, systemPrompt, settings.llmProvider)
    // ... rest of parsing logic stays the same
```

- [ ] **Step 2: Update revisePrompt to use proxy**

Same pattern -- replace direct API calls with `processTextViaProxy`.

- [ ] **Step 3: Update chatWithAI to use proxy**

Replace with a call to `chatViaProxy` from proxyService.

- [ ] **Step 4: Remove dead code**

Remove the private functions that are no longer called:
- `callGemini`, `callClaude`, `callOpenAI` (single-turn)
- `callGeminiChat`, `callClaudeChat`, `callOpenAIChat` (multi-turn)
- `getApiKeyForLLM`

Keep: `buildProcessPrompt`, `buildRewritePrompt`, `applyDictionary`, `escapeRegex` (still used)

- [ ] **Step 5: Commit**

```bash
cd C:\Dev\prattle
git add src/services/llmService.ts
git commit -m "feat: route all LLM calls through proxy, remove direct API call functions"
```

---

### Task 12: Add subscription status display and trial countdown

**Context:** The app needs to show users their access status: "Trial: 2 days remaining", "Subscription: Active", or a locked screen when expired.

**Files:**
- Modify: `C:\Dev\prattle\src\stores\appStore.ts` (add subscription refresh action)
- Modify: `C:\Dev\prattle\src\components\Header.tsx` (show status badge)
- Create: `C:\Dev\prattle\src\components\SubscriptionGate.tsx` (locked screen)

- [ ] **Step 1: Add refreshSubscription to appStore**

Add to the AppState interface and implementation:

```typescript
// In interface:
refreshSubscription: () => Promise<void>

// In implementation:
refreshSubscription: async () => {
  const { getSubscriptionStatus } = await import('../services/authService')
  const status = await getSubscriptionStatus()
  const currentUser = get().user
  if (currentUser) {
    set({
      user: {
        ...currentUser,
        subscriptionStatus: status.status as any,
        plan: status.plan as any,
        accessType: (status as any).accessType || 'expired',
        trialEndsAt: (status as any).trialEndsAt,
        currentPeriodEnd: status.currentPeriodEnd,
        cancelAtPeriodEnd: status.cancelAtPeriodEnd,
      }
    })
  }
},
```

- [ ] **Step 2: Create SubscriptionGate component**

This component wraps the main app content and shows a locked screen when trial/subscription has expired:

```tsx
// C:\Dev\prattle\src\components\SubscriptionGate.tsx
import { useAppStore } from '../stores/appStore'
import { HiLockClosed } from 'react-icons/hi2'

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore()

  if (!user) return null

  const isExpired = user.accessType === 'expired'

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
            // Open subscription page in browser
            window.electronAPI.openExternalUrl('https://voicetype-web.vercel.app/#pricing')
          }}
          className="px-6 py-3 rounded-xl text-sm font-medium bg-cd-accent hover:bg-cd-accent/80 text-white transition-all"
        >
          View Plans & Subscribe
        </button>
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 3: Commit**

```bash
cd C:\Dev\prattle
git add src/stores/appStore.ts src/components/SubscriptionGate.tsx src/components/Header.tsx
git commit -m "feat: add subscription gate, trial countdown display, and locked screen"
```

---

## Chunk 4: Desktop App - Remove Browser STT Provider

### Task 13: Remove browser speech provider option

**Context:** The "Browser Built-in" speech provider uses Chrome's free Web Speech API and doesn't go through any proxy. Since we're removing all free/BYOK paths, this provider must be removed. Deepgram is the only STT provider now (via proxy).

**Files:**
- Modify: `C:\Dev\prattle\src\types\index.ts` (remove 'browser' from speechProvider union)
- Modify: `C:\Dev\prattle\src\components\MainView.tsx` (remove browser speech handling)
- Modify: `C:\Dev\prattle\src\services\speechService.ts` (remove browser transcription exports if no longer imported)

- [ ] **Step 1: Update Settings type**

In `types/index.ts`, change:
```typescript
speechProvider: 'deepgram'  // All speech goes through Deepgram via proxy
```

Remove `'whisper' | 'browser' | 'gemini'` from the union. The user no longer picks a provider.

Similarly simplify `llmProvider`:
```typescript
llmProvider: 'gemini' | 'claude' | 'openai'  // Keep for now -- backend uses this to route
```

- [ ] **Step 2: Remove browser speech code from MainView**

Remove all `speechProvider === 'browser'` branches from startRecording and stopRecording.

- [ ] **Step 3: Update default settings in main.ts**

In `C:\Dev\prattle\electron\main.ts`, find the default settings initialization and change:
```typescript
speechProvider: 'deepgram',
```

- [ ] **Step 4: Commit**

```bash
cd C:\Dev\prattle
git add src/types/index.ts src/components/MainView.tsx electron/main.ts
git commit -m "feat: remove browser/whisper/gemini STT providers, deepgram only via proxy"
```

---

## Chunk 5: Integration + Deploy

### Task 14: Deploy backend changes

**Files:**
- No new files -- just deploy prattle-web

- [ ] **Step 1: Run the Supabase migration**

Open Supabase SQL Editor, paste and run `migration-002-trial.sql`.

- [ ] **Step 2: Set environment variables on Vercel**

Ensure these env vars are set on the Vercel project (voicetype-web):
- `DEEPGRAM_API_KEY` -- Lonnie's Deepgram key
- `ANTHROPIC_API_KEY` -- for Claude LLM processing
- `GEMINI_API_KEY` -- for Gemini LLM processing
- `OPENAI_API_KEY` -- for OpenAI/Whisper (if still needed)

- [ ] **Step 3: Push prattle-web to deploy**

```bash
cd C:\Dev\prattle-web
git push origin main
```

Vercel auto-deploys on push to main.

- [ ] **Step 4: Verify endpoints**

Test the new endpoints:
```bash
# Health check -- subscription status (should return 401 without auth)
curl https://voicetype-web.vercel.app/api/auth/subscription

# Stream token (should return 401 without auth)
curl -X POST https://voicetype-web.vercel.app/api/speech/stream-token
```

Expected: Both return `{"error":"Unauthorized"}` with status 401.

---

### Task 15: Build and test desktop app

- [ ] **Step 1: Build the desktop app**

```bash
cd C:\Dev\prattle
npm run build
```

- [ ] **Step 2: Test the auth flow**

Launch the built app. Expected:
- Auth screen appears (no skip button)
- Google OAuth works
- Email/password form appears
- After signing in, main view loads

- [ ] **Step 3: Test dictation**

After signing in:
- Hold hotkey, speak, release
- Verify text appears (routed through proxy)
- Check that no API key errors appear
- Verify streaming works (words appear in real-time)

- [ ] **Step 4: Test trial expiry**

Manually set a user's `trial_ends_at` to a past date in Supabase, then test:
- App should show locked screen
- No dictation should work

- [ ] **Step 5: Commit final state and push**

```bash
cd C:\Dev\prattle
git push origin main
```

---

## Summary: What This Plan Delivers

After completing all tasks:

1. **Auth required** -- No way to use the app without signing in (Google OAuth or email/password)
2. **No API keys shown** -- Settings page has no key entry UI
3. **All calls proxied** -- STT (Deepgram) and LLM (Claude/Gemini/OpenAI) go through prattle-web
4. **3-day free trial** -- Server-side countdown, starts on signup
5. **App locks on expiry** -- Full lock screen with subscribe CTA
6. **Family accounts** -- `is_family` flag bypasses subscription requirement
7. **WebSocket streaming preserved** -- Uses stream-token endpoint for auth

## What's NOT in This Plan (Future Phases)

- Stripe checkout integration (needs Stripe account setup)
- Tiered pricing (Windows/Android/Bundle)
- Discount codes with manual approval
- Device fingerprinting + anti-abuse
- Mobile apps (React Native)
- App store distribution
