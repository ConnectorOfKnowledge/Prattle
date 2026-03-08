# Prattle - Change Log

## 2026-03-08 — Session 9: Fix Auto-Updater, Bug Reporter, Global Hotkey

### Context
Continuation of Session 8 (rebrand to Prattle, Vercel deployment). This session focused on making the core app experience work properly: auto-updater, bug reporting, and most importantly the global hotkey.

### Issues Fixed

**Auto-Updater Not Working (v1.0.0 → v1.0.1)**
- **Root cause 1:** GitHub repo was private — electron-updater couldn't access the Releases API
- **Fix:** Made repo public: `gh repo edit ConnectorOfKnowledge/Prattle --visibility public`
- **Root cause 2:** Asset filename mismatch — `latest.yml` references dashes (`Prattle-Setup-X.X.X.exe`) but GitHub converts uploaded spaces to dots (`Prattle.Setup.X.X.X.exe`)
- **Fix:** Copy files with dash names before uploading: `cp "Prattle Setup X.X.X.exe" "Prattle-Setup-X.X.X.exe"`

**"Restart to Update" Button Didn't Work (v1.0.3)**
- **Root cause:** Button onClick always called `checkForUpdates()` regardless of update state
- **Fix:** Added `restart-to-update` IPC handler with `autoUpdater.quitAndInstall()`, conditional button onClick, green styling when ready
- **Files:** `electron/main.ts`, `electron/preload.ts`, `src/types/index.ts`, `src/components/SettingsView.tsx`

**Global Hotkey Not Working from Background (v1.0.4) — THE BIG ONE**
- **Root cause 1:** `requestAnimationFrame` pauses in hidden/background windows. When Prattle is minimized to tray and hotkey fires, energy tracking never collected samples → `speechDetected` returned false → recording silently discarded
- **Fix:** Replaced `requestAnimationFrame` with `setInterval` (50ms) for energy tracking
- **Root cause 2:** `AudioContext` can suspend in hidden windows, producing no frequency data
- **Fix:** Added `audioContext.resume()` after creation if state is 'suspended'
- **Root cause 3:** Race condition — `getUserMedia()` takes 500ms+, `stop` command arrives before `start` finishes. Stop checks state, finds 'idle', silently exits
- **Fix:** Store start promise in ref, await it at top of stop function
- **Root cause 4:** Even with fixes above, energy tracking may not work perfectly in hidden windows
- **Fix:** Skip speech detection entirely for hotkey-triggered recordings (`!wasHotkey && !audioStats.speechDetected`)
- **Files:** `src/services/speechService.ts`, `src/components/MainView.tsx`
- **User confirmed working:** Both hold-to-record and hands-free double-tap modes verified

### Bug Reporter Added (v1.0.2)
- Created `src/components/BugReporter.tsx` — floating bug icon (bottom-right) with modal form
- Submits to shared Supabase `tickets` table with `project: 'Prattle'`
- Auto-appends: app version, current view, OS info, timestamp
- Uses separate Supabase client for TicketDeck project (`dgnikbbugiuuwokwenlm`)
- Dropped old `bug_tickets` table via Supabase migration (was superseded by unified `tickets` table)

### Hotkey Diagnostics (v1.0.2)
- Added key event logging (first 5 events) to confirm uiohook receives input
- Added try/catch around `uIOhook.start()` with error notification to renderer

### Build Process Notes
- Google Drive file locks prevent rebuilding to same output directory
- Workaround: use fresh directory each build (`--config.directories.output=releaseN`)
- Release process: build → copy files with dashes → `gh release create` with dash-named assets

### Releases This Session
- **v1.0.1** — Auto-updater fix (repo visibility + filename mismatch)
- **v1.0.2** — Bug reporter, hotkey diagnostics
- **v1.0.3** — Restart-to-update button fix
- **v1.0.4** — Global hotkey fix (energy tracking, race condition, speech detection bypass)

### Files Modified
- `electron/main.ts` — hotkey diagnostics, restart-to-update IPC, try/catch uiohook
- `electron/preload.ts` — restartToUpdate bridge
- `src/services/speechService.ts` — setInterval energy tracking, AudioContext resume
- `src/components/MainView.tsx` — start promise ref, race condition guard, speech detection bypass
- `src/components/SettingsView.tsx` — restart button conditional + green styling
- `src/components/BugReporter.tsx` — NEW: floating bug reporter
- `src/App.tsx` — added BugReporter component
- `src/types/index.ts` — added restartToUpdate type
- `package.json` — version bumps (1.0.0 → 1.0.4)

### Not Done This Session
- Auth/payments/promo codes backend setup (requested by user, deferred to next session)
- Stripe account creation, promo code setup
- Real Supabase credentials in Electron app

---

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

### Commits
1. `7bebfe7` — Add Phase 2 subscription infrastructure (Electron app, 16 files, +928 lines)
2. `c2fc569` — Add landing page with Direction B design (voicetype-web, 19 files, +1417 lines)

---

## 2026-03-06 — Session 6: Prompt Fixes, Indicator Redesign, Commercial Product Decision

### Changes Made
- Completely rewrote BASE_RULES for LLM prompts
- Indicator white box fix + visual redesign (300×56, SVG mic, audio bars, LIVE badge)
- Business decision: commercial subscription product

---

## 2026-03-06 — Session 5: Architecture Fixes + Hotkey Rework + Indicator Overhaul

### Changes Made
- Fix overlay architecture (main.tsx)
- Mic gain slider (GainNode)
- Mode cycling in overlay
- Hotkey system rework (Right Alt default, configurable)

---

## 2026-03-01 — Session 4: Attempted Overlay Improvements → Full Revert

All 8 files reverted to pre-session stable state.

---

## 2026-03-01 — Session 3: HotKeys Overlay + Learning Mode + Polish

## 2026-03-01 — Session 2: Major UI Overhaul + New Features

## 2026-03-01 — Session 1: Initial Build
