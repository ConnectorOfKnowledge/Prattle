# Prattle (formerly VoiceType) - Change Log

## 2026-03-07 — Session 8: Rebrand to Prattle + Vercel Deployment

### Context
Continuation of Session 7 (landing page built, Phase 2 subscription infrastructure complete). This session rebranded the product from "VoiceType" to "Prattle" and deployed the landing page to Vercel.

### Name Change
- **Old name:** VoiceType — conflicted with direct competitor "VoiceType AI" at voicetype.com ($11.59/mo)
- **New name:** Prattle — means "to talk casually at length." Perfect fit: you prattle messily, AI makes it polished.
- **Research done:** 18 name candidates evaluated across descriptive, evocative, compound, and short naming strategies. Prattle won for memorability and brand personality.
- **Other finalists:** Voxkey, Dictio, Voxtap, Diktiv

### Rebrand Changes (voicetype-web)
- Updated all 13 source files with "Prattle" replacing "VoiceType" (47 total occurrences)
- Files updated: Navbar, Hero, Features, HowItWorks, UseCases, FAQ, CTA, Footer, layout.tsx, download/page.tsx, stripe.ts, checkout/route.ts, portal/route.ts
- Stripe plan names: "Prattle Monthly", "Prattle Annual"
- Fallback URLs: prattle.app (from voicetype.app)
- GitHub download link: ConnectorOfKnowledge/Prattle (from VoiceType)
- Zero VoiceType references remaining in src/ directory

### Vercel Deployment
- First deployed as "VoiceType" branding, then redeployed after rebrand
- Live at: https://voicetype-web.vercel.app
- Connected to GitHub repo (auto-deploys on push)
- Team scope: lonnies-projects-69515833
- Build: clean, 12 routes (2 static pages, 7 API routes, 1 not-found, 2 reserved)
- Verified in browser: all sections rendering correctly, animations working

### Commits
1. `ebb4c3c` — Rebrand from VoiceType to Prattle across entire landing page (14 files, +51 -32)

### Not Done This Session
- Electron app still internally branded as "VoiceType" — separate rebrand task
- GitHub repo not renamed yet
- Domain not registered
- Stripe/Supabase not set up

---

## 2026-03-07 — Session 7: Phase 2 Complete — Subscriptions, API Proxy, Landing Page

### Context
Phase 1 was done (packaged .exe, system tray, auto-start, auto-update). This session built the entire revenue infrastructure: user accounts, Stripe subscriptions, API proxy, and a full landing page.

### Business Decisions
- **Pricing finalized:** $9.95/month or $69.95/year (save 42%)
- **Free tier:** Bring your own API keys (existing behavior)
- **Paid tier:** We provide the AI backend via API proxy on Vercel
- **Fixed costs:** ~$21/month (Vercel Pro $20 + domain ~$1)
- **Break-even:** 3-4 monthly subscribers

### New Project: voicetype-web (Next.js 16 on Vercel)
**Landing Page — Direction B: "The Confident Challenger"**
- Warm cream background (#FDF8F3) with amber (#D97706) and teal (#0D9488) accents
- Source Serif 4 for headlines (editorial warmth) + Geist for body text
- Animated hero: before/after demo showing messy speech → clean polished text
- Social proof stats bar (3x faster, 2+ hours saved, any app)
- "How It Works" — 3-step cards with subtle background numbers (01, 02, 03)
- 6 feature cards with alternating amber/teal icons
- 4 use case cards (Email, Slack, Documents, Code) with you-say/you-get examples
- Pricing section with monthly/annual toggle, Free vs Pro comparison
- FAQ accordion with 8 common questions
- Dark CTA section: "Stop typing. Start speaking."
- Sticky navbar with scroll-aware backdrop blur
- Download page with quick setup guide, system requirements, feature checklist

**API Routes:**
- `/api/speech/transcribe` — Proxy to Gemini/Whisper/Deepgram with JWT auth + rate limiting
- `/api/llm/process` — Single-turn LLM proxy (Gemini/Claude/OpenAI)
- `/api/llm/chat` — Multi-turn LLM proxy
- `/api/stripe/checkout` — Creates Stripe Checkout session
- `/api/stripe/portal` — Creates Stripe Customer Portal session
- `/api/stripe/webhook` — Handles checkout.completed, subscription.updated/deleted, payment_failed
- `/api/auth/subscription` — Returns subscription status for authenticated user

**Infrastructure:**
- Supabase SQL migration (profiles, subscriptions, usage tables with RLS)
- Lazy Supabase/Stripe client initialization via Proxy pattern (builds without env vars)
- Rate limiting: 500 speech + 1000 LLM requests per day per user

### Changes to Electron App
**New Files:**
- `src/services/authService.ts` — Supabase auth (signup, login, logout, session, subscription)
- `src/services/proxyService.ts` — API proxy client (transcribeViaProxy, processTextViaProxy, chatViaProxy)
- `src/components/AuthView.tsx` — Login/signup form with "Continue free" option
- `src/components/AccountView.tsx` — Subscription management, upgrade buttons, Stripe portal

**Modified Files:**
- `src/App.tsx` — Auth gate, session check on mount, auth state listener
- `src/stores/appStore.ts` — Added user/auth state (UserProfile, isAuthenticated, isCheckingAuth)
- `src/types/index.ts` — Added UserProfile interface, openExternalUrl to electronAPI
- `src/components/Header.tsx` — Account/Sign In button with green dot for active subscribers
- `src/components/MainView.tsx` — Proxy vs BYOK routing (paid → proxy, free → direct API)
- `src/services/llmService.ts` — Exported buildProcessPrompt(), buildRewritePrompt()
- `src/services/speechService.ts` — Gemini transcription improvements (temp 0, strict prompt)
- `src/components/SettingsView.tsx` — Added "Browser Built-in" speech provider option
- `electron/preload.ts` — Added openExternalUrl IPC bridge
- `electron/main.ts` — Added open-external-url handler via shell.openExternal()
- `package.json` — Added @supabase/supabase-js dependency

### Bug Fixes
- Fixed Gemini speech hallucination (temperature 0, stricter transcription prompt)
- Fixed Stripe v20 type errors (Invoice.subscription, Subscription.current_period_*)
- Fixed Stripe API version (2026-02-25.clover)
- Fixed build crash without env vars (lazy Supabase/Stripe client via Proxy pattern)
- Attempted gemini-2.0-flash (404 — "no longer available"), reverted to gemini-2.5-flash

### Commits
1. `7bebfe7` — Add Phase 2 subscription infrastructure (Electron app, 16 files, +928 lines)
2. `c2fc569` — Add landing page with Direction B design (voicetype-web, 19 files, +1417 lines)

---

## 2026-03-06 — Session 6: Prompt Fixes, Indicator Redesign, Commercial Product Decision

### Context
Continued from Session 5 (which fixed overlay architecture, re-implemented mic gain + mode cycling, rewrote hotkey system to use Right Alt). This session focused on prompt accuracy, indicator visual improvements, and the decision to make VoiceType a commercial subscription product.

### Changes Made

**Prompt Improvements** (`src/constants/modes.ts`, `src/services/llmService.ts`)
- Completely rewrote BASE_RULES — now tells LLM it's a "speech-to-text post-processor" with clear context
- Only removes true verbal fillers (um, uh, hmm, er, ah) — no longer removes legitimate words like "actually", "like", "right"
- Removed em-dash ban (was causing unnecessary restructuring)
- Clean mode: truly minimal now — only fixes punctuation, capitalization, transcription errors
- Professional mode: specific about what to change vs preserve
- Casual mode: clear about keeping conversational tone
- Added `[Voice dictation transcription to clean up]:` wrapper to user message in processText()
- Simplified rewriteText() system prompt — removed aggressive BASE_RULES, focused on applying the spoken instruction

**Indicator White Box Fix** (`src/main.tsx`)
- When running as indicator window, strips `document.documentElement` and `document.body` backgrounds to transparent
- Clears body className to remove Tailwind bg classes from index.html
- Eliminates the white box that appeared when the indicator was idle on Windows

**Indicator Visual Redesign** (`src/components/FloatingIndicator.tsx`, `electron/main.ts`)
- Window size increased from 220×44 to 300×56
- Added SVG microphone icon with pulsing ring animation
- Added 5 animated audio bars (CSS animation, not yet reactive to mic)
- Larger mode badge (12px bold, bordered pill, still clickable to cycle)
- Timer bumped to 14px mono, white color for better readability
- Added "LIVE" badge with pulsing red dot on right side
- Processing state: clean spinner + "Processing..." text
- Deeper shadows and subtle inner highlight for depth
- 16px border radius for softer pill shape

### Business Decision
- VoiceType will become a **commercial subscription product**
- Pricing: **$19.95/month or $89/year** (undercutting competitor at $30/mo)
- We provide API backend (users don't need their own keys)
- Platform targets: Windows (current), Android (Play Store), eventually Mac/iOS
- Infrastructure needed: API proxy, Supabase auth, Stripe subscriptions, auto-updater

### Files Modified
- `src/constants/modes.ts` — Rewrote BASE_RULES and all 3 mode descriptions
- `src/services/llmService.ts` — Added context wrapper to processText(), simplified rewriteText()
- `src/main.tsx` — Added transparent background for indicator window
- `src/components/FloatingIndicator.tsx` — Complete visual redesign
- `electron/main.ts` — Indicator window size 300×56
- `PROJECT_STATUS.md` — Updated to current state with commercial roadmap
- `TODO.md` — Reorganized with ship-blocker priorities
- `IDEAS.md` — Added business model, multi-platform strategy, marketing ideas

---

## 2026-03-06 — Session 5: Architecture Fixes + Hotkey Rework + Indicator Overhaul

### Context
User said "Fix anything we have tagged to fix, then launch the app." Three tagged fixes from Session 4's revert were re-implemented properly.

### Changes Made

**Fix 1: Overlay Architecture** (`src/main.tsx`, `src/App.tsx`)
- Moved indicator detection from App.tsx to main.tsx — separate component trees
- Eliminates React hooks violation (early return before useEffect)
- App.tsx is now a clean component with no indicator logic

**Fix 2: Mic Gain Slider** (`src/types/index.ts`, `src/services/speechService.ts`, `src/components/SettingsView.tsx`, `src/components/MainView.tsx`)
- Added `micGain: number` to Settings interface (0-200, percentage)
- Added GainNode to audio chain: source → gain → analyser
- Added `setMicGain()` method to SpeechService
- Added slider UI (0-200%) in SettingsView Preferences section
- Wired up gain application in MainView startRecordingInternal

**Fix 3: Mode Cycling in Overlay** (`src/components/FloatingIndicator.tsx`)
- Mode name in indicator is a clickable button that cycles through Clean/Professional/Casual
- Persists mode change to settings file via IPC

**Hotkey System Rework** (`electron/main.ts`, `src/components/SettingsView.tsx`)
- Created full configurable hotkey system with KEY_NAME_TO_KEYCODE map
- Default changed from Ctrl+Shift+Space to RightAlt
- Supports single keys and modifier combos
- SettingsView: changed from text input to dropdown (RightAlt, F2, F8, etc.)
- update-hotkey IPC handler now functional (was previously a no-op)
- Migration: auto-converts old Ctrl+Shift+Space to RightAlt

---

## 2026-03-01 — Session 4: Attempted Overlay Improvements → Full Revert

All 8 files reverted to pre-session stable state. See conversations/ for details.

---

## 2026-03-01 — Session 3: HotKeys Overlay + Learning Mode + Polish

- Global HotKey Overlay (OverlayView.tsx)
- Learning Mode (LearningView.tsx, SettingsView.tsx)

---

## 2026-03-01 — Session 2: Major UI Overhaul + New Features

- Platform Sidebar, Simultaneous Processing, Action Bar, Paste to External
- Global Rules, Chat/Modify Panel, Ticket System, Mic Volume Meter

---

## 2026-03-01 — Session 1: Initial Build

- Complete app scaffold: Electron + React + Vite + Tailwind + TypeScript
- All views, speech recording, transcription, LLM processing, dictionary, learning
