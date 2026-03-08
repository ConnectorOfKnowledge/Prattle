# Prattle (formerly VoiceType) - Project Status

## What It Is
A desktop voice-to-text app for Windows. Hold a key, speak, release — your words get transcribed, cleaned by AI, and typed directly into whatever app you're in. Think of it as a smarter, faster alternative to Windows dictation.

**Rebranded to "Prattle"** as of Session 8 (2026-03-07) — the name "VoiceType" conflicts with a direct competitor at voicetype.com.

**Commercial Product** — Pricing: $9.95/month or $69.95/year (save 42%). Free tier: bring your own API keys. Paid tier: we provide the AI API backend.

## Tech Stack
- **Desktop:** Electron 34.2 + electron-builder (NSIS installer, auto-updater)
- **Frontend:** React 18.3 + TypeScript 5.7
- **Build:** Vite 6.1 + vite-plugin-electron + electron-builder
- **Styling:** Tailwind CSS 3.4
- **State:** Zustand 5.0
- **Keyboard Hooks:** uiohook-napi (global hotkey system)
- **Speech-to-Text:** Gemini 2.5 Flash, Deepgram, Whisper API, Browser Web Speech
- **LLM Processing:** Gemini Flash, Claude Haiku, GPT-4o-mini
- **Auth:** Supabase (client-side in Electron app)
- **Payments:** Stripe (Checkout + Customer Portal)
- **Web/API:** Next.js 16 on Vercel (landing page + API proxy)
- **Bug Tracking:** TicketDeck (shared Supabase project `dgnikbbugiuuwokwenlm`)

## Current State (2026-03-08, Session 9)
**Status: Core app fully functional — hotkey, auto-updater, and bug reporter all working. Ready for auth/payments backend setup.**

### What's Built & Working
#### Desktop App (Electron)
- [x] **Hold-to-Record hotkey** — Right Alt (configurable). Hold to record, release to process + auto-type
- [x] **Double-tap hands-free** — Double-tap Right Alt for continuous recording, tap once to stop
- [x] **Hotkey works from background** — Fixed in v1.0.4: energy tracking, race conditions, speech detection bypass
- [x] **Floating indicator overlay** — Shows recording state, mode name, duration, animated audio bars, "LIVE" badge
- [x] **5 dictation modes** — Clean, Professional, Casual + custom modes via prompt editor
- [x] **Mode cycling from overlay** — Click the mode badge in the indicator to switch modes
- [x] **Mic gain slider** — 0-200% gain control in settings, applied via Web Audio GainNode
- [x] **AI text processing** — Speech-to-text → dictionary replacements → LLM cleanup per mode
- [x] **Auto-type output** — Processed text typed directly into the active app via keyboard simulation
- [x] **System tray** — Runs in background, right-click menu with Show/Quit
- [x] **Auto-start on login** — Toggle in settings
- [x] **Auto-updater** — Checks GitHub Releases for updates on launch, restart-to-update button works
- [x] **Bug reporter** — Floating bug icon, submits to shared TicketDeck Supabase project
- [x] **.exe installer** — Prattle Setup 1.0.4.exe (~97 MB), built with electron-builder NSIS
- [x] **Settings** — Provider selection, API keys, mic gain, hotkey, font size
- [x] **Dictionary** — Case-insensitive whole-word replacements applied before AI processing
- [x] **Modes view** — Customize mode prompts, create custom modes (via chat-based prompt editor)
- [x] **Learning system** — Auto-detect edit patterns, extract reusable rules via LLM analysis
- [x] **Auth system** — Supabase sign up/in/out, session persistence across restarts
- [x] **Account management** — Subscription status, upgrade buttons, Stripe Customer Portal
- [x] **Proxy routing** — Paid users → API proxy (no keys needed), Free → BYOK direct calls
- [x] **Data persistence** — All settings/data as JSON in %AppData%\prattle-data

#### Web Project (voicetype-web → now "Prattle" branding)
- [x] **Landing page** — Full marketing page with Direction B design (warm cream, amber/teal, serif headlines)
- [x] **Rebranded to Prattle** — All 13 source files updated, all 47 references changed
- [x] **Deployed to Vercel** — Live at https://voicetype-web.vercel.app
- [x] **API proxy routes** — /api/speech/transcribe, /api/llm/process, /api/llm/chat
- [x] **Stripe routes** — /api/stripe/checkout, /api/stripe/portal, /api/stripe/webhook
- [x] **Auth route** — /api/auth/subscription
- [x] **Supabase migration** — profiles, subscriptions, usage tables with RLS
- [x] **Lazy client init** — Supabase/Stripe clients use Proxy pattern (build without env vars)

### What Lonnie Needs to Do (Before Going Live)
1. **Register a domain** — prattle.app or similar (prattle.com likely taken)
2. **Create Stripe account** at stripe.com
3. **Create two Stripe products** — "Prattle Monthly" ($9.95/mo) and "Prattle Annual" ($69.95/yr)
4. **Run Supabase migration** — Execute supabase/migration.sql in Supabase SQL Editor
5. **Set env vars on Vercel** — STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, pricing IDs
6. **Update placeholder values** in Electron app code:
   - `src/services/authService.ts` — SUPABASE_URL, SUPABASE_ANON_KEY, PROXY_BASE
   - `src/services/proxyService.ts` — PROXY_BASE domain
   - `src/components/AccountView.tsx` — Stripe price IDs
7. **Rebuild .exe with real credentials**
8. **Set up promo/coupon codes** — Free code for Lonnie, 50% off for friends

### Known Issues
- First press of hotkey shows blank indicator briefly (window created before React mounts)
- Audio bars in indicator are CSS animation only, not reactive to actual mic input
- GPU cache warnings when running from Google Drive (cosmetic only)
- Google Drive file locks prevent building to same output dir twice (use fresh `releaseN` dir each build)

## Repos
- **Desktop app:** ConnectorOfKnowledge/Prattle (public)
- **Web/API:** ConnectorOfKnowledge/voicetype-web (private) — already rebranded to Prattle

## Releases
- v1.0.0 — Initial packaged release
- v1.0.1 — Update system fix (filename mismatch)
- v1.0.2 — Hotkey diagnostics, bug reporter
- v1.0.3 — Restart-to-update button fix
- v1.0.4 — **Global hotkey fix** (energy tracking, race condition, speech detection bypass)

## Key Files — Desktop App
```
Prattle/
├── electron/
│   ├── main.ts          # Electron main process, hotkey, tray, auto-updater, IPC
│   └── preload.ts       # Context bridge (electronAPI)
├── src/
│   ├── main.tsx          # React entry point, indicator vs app routing
│   ├── App.tsx           # Main app shell, auth gate, view routing
│   ├── types/index.ts    # TypeScript interfaces + UserProfile + electronAPI
│   ├── stores/appStore.ts  # Zustand global state + auth state
│   ├── services/
│   │   ├── speechService.ts  # Audio recording, GainNode, analyser, energy tracking
│   │   ├── llmService.ts     # LLM calls, buildProcessPrompt, buildRewritePrompt
│   │   ├── authService.ts    # Supabase auth client (signup, login, session, subscription)
│   │   └── proxyService.ts   # API proxy client (transcribe, process, chat via proxy)
│   └── components/
│       ├── Header.tsx, MainView.tsx, SettingsView.tsx, ModesView.tsx, DictionaryView.tsx
│       ├── AuthView.tsx       # Login/signup form
│       ├── AccountView.tsx    # Subscription management, upgrade, portal
│       ├── BugReporter.tsx    # Floating bug icon + modal → TicketDeck
│       └── FloatingIndicator.tsx  # Overlay widget
```

## Data Storage
All user data: `%AppData%\prattle-data\`
- `settings.json` — API keys, providers, preferences, hotkey, mic gain
- `dictionary.json` — Word replacements
- `learned-patterns.json` — Auto + manual patterns

## Build Notes
- Build from Google Drive requires fresh output dir each time: `npx electron-builder --win --config.directories.output=releaseN`
- Release assets must be renamed with dashes before uploading: `Prattle Setup X.X.X.exe` → `Prattle-Setup-X.X.X.exe`
- `latest.yml` already uses dash names, but GitHub converts spaces to dots on upload
