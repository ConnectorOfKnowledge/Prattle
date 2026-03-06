# VoiceType - Project Status

## What It Is
A desktop voice-to-text app for Windows. Hold a key, speak, release — your words get transcribed, cleaned by AI, and typed directly into whatever app you're in. Think of it as a smarter, faster alternative to Windows dictation.

**Commercial Product** — Target price: $19.95/month or $89/year. We provide the AI API backend so users don't need their own keys.

## Tech Stack
- **Desktop:** Electron 34.2
- **Frontend:** React 18.3 + TypeScript 5.7
- **Build:** Vite 6.1 + vite-plugin-electron + electron-builder
- **Styling:** Tailwind CSS 3.4
- **State:** Zustand 5.0
- **Keyboard Hooks:** uiohook-napi (global hotkey system)
- **Speech-to-Text:** Whisper API, Deepgram, Gemini, Browser Web Speech
- **LLM Processing:** Gemini Flash, Claude Haiku, GPT-4o-mini

## Current State (2026-03-06, Session 6)
**Status: Core functionality working — hotkey dictation, transcription, AI cleanup, auto-typing all functional**

### What's Built & Working
- [x] **Hold-to-Record hotkey** — Right Alt (configurable). Hold to record, release to process + auto-type
- [x] **Double-tap hands-free** — Double-tap Right Alt for continuous recording, tap once to stop
- [x] **Floating indicator overlay** — Shows recording state, mode name, duration, animated audio bars, "LIVE" badge
- [x] **3 dictation modes** — Clean (minimal cleanup), Professional (business polish), Casual (conversational)
- [x] **Mode cycling from overlay** — Click the mode badge in the indicator to switch modes
- [x] **Mic gain slider** — 0-200% gain control in settings, applied via Web Audio GainNode
- [x] **AI text processing** — Speech-to-text → dictionary replacements → LLM cleanup per mode
- [x] **Auto-type output** — Processed text typed directly into the active app via keyboard simulation
- [x] **Configurable hotkey** — Dropdown in settings: Right Alt, F2, F8, F9, Insert, ScrollLock, Pause, combos
- [x] **Main app window** — Full recording/editing interface with volume meter, action bar
- [x] **Settings** — Provider selection, API keys, mic gain, hotkey, font size, theme
- [x] **Dictionary** — Case-insensitive whole-word replacements applied before AI processing
- [x] **Modes view** — Customize mode prompts, create custom modes (via chat-based prompt editor)
- [x] **Learning system** — Auto-detect edit patterns, extract reusable rules via LLM analysis
- [x] **Data persistence** — All settings/data as JSON in %AppData%\voicetype-data

### Known Issues
- First press of hotkey shows blank indicator briefly (window created before React mounts)
- Audio bars in indicator are CSS animation only, not reactive to actual mic input
- GPU cache warnings when running from Google Drive (cosmetic only)

### Architecture Highlights
- **Indicator detection** in `main.tsx` (not App.tsx) — separate component trees, no hooks violations
- **Transparent overlay** — `document.body.style.background = 'transparent'` strips CSS classes for indicator window
- **Hotkey system** — uiohook-napi with configurable key mapping, modifier tracking, double-tap detection

## Product Roadmap (Commercial Launch)

### Phase 1: Polish (Current)
- [ ] Fix first-press blank indicator
- [ ] Make audio bars reactive to actual microphone input
- [ ] System tray icon (runs in background)
- [ ] Onboarding flow (first-launch setup)
- [ ] App icon and branding

### Phase 2: Subscription Infrastructure
- [ ] API proxy server (Vercel Edge Functions or Cloudflare Workers)
- [ ] Auth system (Supabase)
- [ ] Stripe integration (subscriptions, $19.95/mo or $89/yr)
- [ ] License verification in app
- [ ] Usage tracking and rate limiting

### Phase 3: Distribution
- [ ] Windows code signing certificate
- [ ] electron-updater for auto-updates
- [ ] Package .exe installer with electron-builder
- [ ] Landing page with Stripe checkout
- [ ] GitHub Releases for update hosting

### Phase 4: Marketing & Growth
- [ ] Landing page / marketing site
- [ ] Demo video / product walkthrough
- [ ] Social media presence
- [ ] SEO + content marketing
- [ ] User feedback loop

## Key Files
```
VoiceType/
├── electron/
│   ├── main.ts          # Electron main process, hotkey system, indicator window, IPC handlers
│   └── preload.ts       # Context bridge (electronAPI)
├── src/
│   ├── main.tsx          # React entry point, indicator vs app routing, transparent body
│   ├── App.tsx           # Main app shell, view routing
│   ├── index.css         # Tailwind + custom styles
│   ├── types/index.ts    # TypeScript interfaces + window.electronAPI declaration
│   ├── stores/appStore.ts  # Zustand global state
│   ├── constants/modes.ts  # Dictation modes + base rules (LLM prompts)
│   ├── services/
│   │   ├── speechService.ts  # Audio recording, GainNode, analyser
│   │   └── llmService.ts     # LLM calls, text processing, rewrite, chat, pattern analysis
│   └── components/
│       ├── FloatingIndicator.tsx  # Floating overlay (mic icon, audio bars, mode badge, timer)
│       ├── Header.tsx             # Navigation
│       ├── MainView.tsx           # Recording + editing + volume meter
│       ├── SettingsView.tsx       # All settings (providers, keys, gain, hotkey)
│       ├── ModesView.tsx          # Mode prompt customization
│       ├── DictionaryView.tsx     # Word replacement CRUD
│       └── LearningView.tsx       # Pattern management
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Data Storage
All user data: `%AppData%\voicetype-data\`
- `settings.json` — API keys, providers, preferences, hotkey, mic gain
- `dictionary.json` — Word replacements
- `learned-patterns.json` — Auto + manual patterns

## GitHub
- **Repo:** ConnectorOfKnowledge/VoiceType
- **Branch:** main
