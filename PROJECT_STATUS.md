# VoiceType - Project Status

## What It Is
A desktop voice-to-text app for Windows. Hold a key, speak, release — your words get transcribed, cleaned by AI, and typed directly into whatever app you're in. Think of it as a smarter, faster alternative to Windows dictation.

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

## Current State (2026-03-07, Session 7)
**Status: Phase 2 complete — subscription infrastructure built, landing page live, ready for deployment**

### What's Built & Working
#### Desktop App (VoiceType.exe)
- [x] **Hold-to-Record hotkey** — Right Alt (configurable). Hold to record, release to process + auto-type
- [x] **Double-tap hands-free** — Double-tap Right Alt for continuous recording, tap once to stop
- [x] **Floating indicator overlay** — Shows recording state, mode name, duration, animated audio bars, "LIVE" badge
- [x] **5 dictation modes** — Clean, Professional, Casual + custom modes via prompt editor
- [x] **Mode cycling from overlay** — Click the mode badge in the indicator to switch modes
- [x] **Mic gain slider** — 0-200% gain control in settings, applied via Web Audio GainNode
- [x] **AI text processing** — Speech-to-text → dictionary replacements → LLM cleanup per mode
- [x] **Auto-type output** — Processed text typed directly into the active app via keyboard simulation
- [x] **System tray** — Runs in background, right-click menu with Show/Quit
- [x] **Auto-start on login** — Toggle in settings
- [x] **Auto-updater** — Checks GitHub Releases for updates on launch
- [x] **.exe installer** — VoiceType Setup 1.0.0.exe (97 MB), built with electron-builder NSIS
- [x] **Settings** — Provider selection, API keys, mic gain, hotkey, font size
- [x] **Dictionary** — Case-insensitive whole-word replacements applied before AI processing
- [x] **Modes view** — Customize mode prompts, create custom modes (via chat-based prompt editor)
- [x] **Learning system** — Auto-detect edit patterns, extract reusable rules via LLM analysis
- [x] **Auth system** — Supabase sign up/in/out, session persistence across restarts
- [x] **Account management** — Subscription status, upgrade buttons, Stripe Customer Portal
- [x] **Proxy routing** — Paid users → API proxy (no keys needed), Free → BYOK direct calls
- [x] **Data persistence** — All settings/data as JSON in %AppData%\voicetype-data

#### Web Project (voicetype-web)
- [x] **Landing page** — Full marketing page with Direction B design (warm cream, amber/teal, serif headlines)
- [x] **Hero section** — Animated before/after demo showing messy speech → clean text
- [x] **Features section** — 6 feature cards (modes, AI learning, voice rewrite, dictionary, hotkey, providers)
- [x] **How It Works** — 3-step visual walkthrough
- [x] **Use Cases** — 4 examples (Email, Slack, Documents, Code) with before/after
- [x] **Pricing** — Monthly/annual toggle, Free vs Pro comparison
- [x] **FAQ** — 8 accordion items covering common questions
- [x] **Download page** — System requirements, quick setup guide, feature checklist
- [x] **API proxy routes** — /api/speech/transcribe, /api/llm/process, /api/llm/chat
- [x] **Stripe routes** — /api/stripe/checkout, /api/stripe/portal, /api/stripe/webhook
- [x] **Auth route** — /api/auth/subscription
- [x] **Supabase migration** — profiles, subscriptions, usage tables with RLS
- [x] **Lazy client init** — Supabase/Stripe clients use Proxy pattern (build without env vars)

### What Lonnie Needs to Do (Before Going Live)
1. **Register a domain** — e.g., getvoicetype.com (note: voicetype.com is taken by a competitor)
2. **Create Stripe account** at stripe.com
3. **Create two Stripe products** — "VoiceType Monthly" ($9.95/mo) and "VoiceType Annual" ($69.95/yr)
4. **Run Supabase migration** — Execute supabase/migration.sql in Supabase SQL Editor
5. **Deploy voicetype-web to Vercel** — Connect GitHub repo, set env vars
6. **Update placeholder values** in code:
   - `src/services/authService.ts` — SUPABASE_URL, SUPABASE_ANON_KEY, PROXY_BASE
   - `src/services/proxyService.ts` — PROXY_BASE domain
   - `src/components/AccountView.tsx` — Stripe price IDs

### Known Issues
- First press of hotkey shows blank indicator briefly (window created before React mounts)
- Audio bars in indicator are CSS animation only, not reactive to actual mic input
- GPU cache warnings when running from Google Drive (cosmetic only)
- Name conflict: "VoiceType AI" exists at voicetype.com — consider differentiating or renaming

## Repos
- **Desktop app:** ConnectorOfKnowledge/VoiceType (private)
- **Web/API:** ConnectorOfKnowledge/voicetype-web (private)

## Key Files — Desktop App
```
VoiceType/
├── electron/
│   ├── main.ts          # Electron main process, hotkey, tray, auto-updater, IPC
│   └── preload.ts       # Context bridge (electronAPI)
├── src/
│   ├── main.tsx          # React entry point, indicator vs app routing
│   ├── App.tsx           # Main app shell, auth gate, view routing
│   ├── types/index.ts    # TypeScript interfaces + UserProfile + electronAPI
│   ├── stores/appStore.ts  # Zustand global state + auth state
│   ├── services/
│   │   ├── speechService.ts  # Audio recording, GainNode, analyser
│   │   ├── llmService.ts     # LLM calls, buildProcessPrompt, buildRewritePrompt
│   │   ├── authService.ts    # Supabase auth client (signup, login, session, subscription)
│   │   └── proxyService.ts   # API proxy client (transcribe, process, chat via proxy)
│   └── components/
│       ├── Header.tsx, MainView.tsx, SettingsView.tsx, ModesView.tsx, DictionaryView.tsx
│       ├── AuthView.tsx       # Login/signup form
│       ├── AccountView.tsx    # Subscription management, upgrade, portal
│       └── FloatingIndicator.tsx  # Overlay widget
```

## Key Files — Web Project
```
voicetype-web/
├── src/app/
│   ├── page.tsx           # Landing page (assembles all sections)
│   ├── download/page.tsx  # Download page
│   ├── api/
│   │   ├── speech/transcribe/route.ts  # Speech proxy
│   │   ├── llm/process/route.ts        # LLM proxy (single-turn)
│   │   ├── llm/chat/route.ts           # LLM proxy (multi-turn)
│   │   ├── stripe/checkout/route.ts    # Create Stripe Checkout session
│   │   ├── stripe/portal/route.ts      # Create Stripe Customer Portal
│   │   ├── stripe/webhook/route.ts     # Handle Stripe events
│   │   └── auth/subscription/route.ts  # Get subscription status
│   └── globals.css        # Tailwind v4 theme (cream, amber, teal palette)
├── src/components/        # Navbar, Hero, SocialProof, HowItWorks, Features, UseCases, Pricing, FAQ, CTA, Footer
├── src/lib/
│   ├── supabase.ts        # Lazy Supabase admin client via Proxy
│   └── stripe.ts          # Lazy Stripe client via Proxy
└── supabase/migration.sql # Database schema
```

## Data Storage
All user data: `%AppData%\voicetype-data\`
- `settings.json` — API keys, providers, preferences, hotkey, mic gain
- `dictionary.json` — Word replacements
- `learned-patterns.json` — Auto + manual patterns
