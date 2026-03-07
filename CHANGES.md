# VoiceType - Change Log

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

**Indicator Window** (`src/components/FloatingIndicator.tsx`, `electron/main.ts`, `electron/preload.ts`, `src/types/index.ts`)
- Added hideIndicator IPC method (sends 'hide-indicator' to main process)
- FloatingIndicator returns null when idle + calls hideIndicator() to hide window
- 3-second processing delay before hiding
- Timer ref with proper cleanup to avoid race conditions

### Files Created
- None

### Files Modified
- `src/main.tsx`, `src/App.tsx`, `src/types/index.ts`, `src/services/speechService.ts`
- `src/components/FloatingIndicator.tsx`, `src/components/SettingsView.tsx`, `src/components/MainView.tsx`
- `electron/main.ts`, `electron/preload.ts`

---

## 2026-03-01 — Session 4: Attempted Overlay Improvements → Full Revert

### What Was Attempted
Two features were requested:
1. **Platform dropdown in overlay** — Replace the static platform badge in the overlay title bar with a `<select>` dropdown so the user can switch platforms from the overlay
2. **Mic gain slider in Settings** — Add a microphone input gain control (0-200%) using a Web Audio API GainNode

### What Was Implemented (then reverted)
- `OverlayView.tsx` — Platform dropdown with `activePlatform` state, `handlePlatformChange`, `enabledPlatforms` computed value, `loadError` error handling state, `HiChevronUpDown` icon, mic gain application
- `electron/main.ts` — `process.env.VITE_DEV_SERVER_URL` for both main and overlay URLs (better dev server detection), overlay cleanup when main window closes, `did-fail-load` listener for debugging, `micGain: 100` in defaults and migration
- `speechService.ts` — Added `GainNode` to audio chain (source → gain → analyser), `setMicGain()` and `getMicGain()` methods
- `SettingsView.tsx` — Microphone card with input gain slider (0-200%, step 5)
- `MainView.tsx` — Applied mic gain before recording
- `types/index.ts` — Added `micGain: number` to Settings interface
- `main.tsx` — Moved overlay detection from App.tsx (attempted fix for hooks violation)
- `App.tsx` — Removed overlay detection (attempted fix)

### What Went Wrong
After implementing the changes, the overlay window opened as a blank white rectangle — React failed to mount (`<div id="root"></div>` was empty). DevTools showed 4 console errors.

**Debugging steps taken:**
1. Checked dev server output — no build errors
2. Verified `HiChevronUpDown` exists in react-icons/hi2 — confirmed
3. Added DevTools to overlay in dev mode for inspection
4. Added `did-fail-load` listener
5. Changed overlay URL to use `process.env.VITE_DEV_SERVER_URL`
6. Added error handling and visible error/loading states in OverlayView
7. User screenshot revealed empty `<div id="root">` — React not mounting at all
8. Identified possible React hooks violation in App.tsx (early return before useEffect)
9. Moved overlay detection to main.tsx as fix
10. Fix wasn't verified because a stale overlay BrowserWindow from a previous Electron session persisted on screen

**Root cause:** Uncertain. Suspected React hooks ordering issue or a problem in the new OverlayView state management. The `activePlatform` useState was declared at line 200 but referenced in `handleToggle` dependency array at line 168 — while JavaScript handles this fine, the new state + effects may have disrupted rendering.

### Resolution
**All 8 files were fully reverted** to the pre-session (Session 3) stable state. The overlay, main app, and all features are back to their previously working versions. The platform dropdown and mic gain features are parked as future tickets.

### Files Reverted (8 total)
- `src/main.tsx` — Back to just rendering `<App />`
- `src/App.tsx` — Overlay detection restored
- `src/components/OverlayView.tsx` — Static platform badge, no dropdown, no error handling, no mic gain
- `electron/main.ts` — Simple `http://localhost:5173` URLs, no overlay cleanup, no micGain
- `src/services/speechService.ts` — No GainNode, simple source → analyser chain
- `src/components/SettingsView.tsx` — No Microphone card
- `src/components/MainView.tsx` — No mic gain application
- `src/types/index.ts` — No micGain field

### Lessons Learned
- The overlay architecture is fragile — overlay detection in App.tsx with early return before hooks is risky
- Future overlay changes should be tested incrementally (one change at a time)
- Consider moving overlay detection to main.tsx for a cleaner component tree separation
- Always kill stale Electron processes before debugging overlay issues
- The `VITE_DEV_SERVER_URL` approach for overlay URLs was a good improvement worth re-adding

---

## 2026-03-01 — Session 3: HotKeys Overlay + Learning Mode + Polish

### Features Added
- **Global HotKey Overlay** (`OverlayView.tsx` — new file, `electron/main.ts`)
  - Ctrl+Shift+Space opens a compact 380x220 always-on-top overlay window
  - Contains Record, Copy, and Paste buttons for quick voice capture
  - Overlay floats above all other windows, can be dismissed with Escape or the close button
  - New OverlayView.tsx component with minimal UI for quick-access workflow
  - Hotkey registration and overlay window creation added to electron/main.ts
  - Hotkey configurable in Settings

- **Learning Mode** (`LearningView.tsx`, `SettingsView.tsx`)
  - Toggle in Settings to enable/disable Learning Mode
  - When enabled, auto-detects word corrections when user edits text and copies
  - Corrections automatically added to dictionary without manual entry
  - Status banner added to LearningView showing whether learning is active/inactive

### Previously Completed This Day (Session 2)
- Simultaneous platform processing (all platforms process in parallel)
- Ticket email export button
- Default global rule for filler word removal
- Microphone volume meter with 24 visual frequency bars

### Files Created
- `src/components/OverlayView.tsx`

### Files Modified
- `electron/main.ts` — overlay window creation, globalShortcut registration, hotkey IPC
- `electron/preload.ts` — overlay-related bridge methods
- `src/types/index.ts` — overlay and learning mode types
- `src/stores/appStore.ts` — learning mode state
- `src/components/LearningView.tsx` — learning mode status banner, auto-detection logic
- `src/components/SettingsView.tsx` — learning mode toggle, hotkey configuration

---

## 2026-03-01 — Session 2: Major UI Overhaul + New Features

### Features Added
- **Platform Sidebar** (`PlatformSidebar.tsx` — new file)
  - Moved platforms from horizontal pills to vertical sidebar on the left
  - Shows text preview snippets for each platform
  - Collapsible to mini icon mode
  - Active platform highlighted, spinner when processing

- **Simultaneous Platform Processing** (`MainView.tsx`)
  - All enabled platforms now process in parallel after recording finishes
  - Sidebar previews populate together instead of on-demand
  - Raw/no-prompt platforms get the raw transcription directly

- **Action Bar Restructure** (`MainView.tsx`)
  - Moved Copy/Paste/Clear/Redo/Modify buttons to action bar flanking the record button
  - No more scrolling to find buttons — everything is accessible near the mic

- **Paste to External Window** (`electron/main.ts`, `preload.ts`)
  - New "Paste" button that auto-pastes text into the previously focused window
  - Uses clipboard + PowerShell SendKeys to simulate Ctrl+V
  - Minimizes VoiceType, pastes, then restores

- **Global Rules** (`PromptsView.tsx`, `llmService.ts`)
  - Cross-platform text processing rules (e.g., filler word removal)
  - Applied to all platforms via system prompt prepending
  - Default rule: remove filler words (um, uh, ah, er, like, you know, etc.)

- **Chat/Modify Panel** (`ChatPanel.tsx` — new file)
  - AI chat panel for refining output text (MainView) or improving prompt templates (PromptsView)
  - Multi-turn conversation with Gemini/Claude/OpenAI
  - `<modified>` tag extraction for clean apply/reject workflow
  - "Apply Suggestion" button when AI provides modified text

- **Ticket System** (`TicketsView.tsx` — new file)
  - In-app feature request / change tracker
  - Add, edit, delete (with confirmation), status toggle (open → in-progress → done)
  - Filter by status and priority, sorted by status then priority
  - Stats bar showing counts per status
  - Email export: generates formatted report, copy to clipboard

- **Microphone Volume Meter** (`speechService.ts`, `MainView.tsx`)
  - AudioContext + AnalyserNode added to SpeechService
  - 24-bar frequency spectrum visualization during recording
  - Color-coded: green (quiet), amber (medium), red (loud)
  - Works with all speech providers (browser mode gets separate visualization stream)
  - 30fps polling with requestAnimationFrame

### Bug Fixes
- **Double Window Fix** (`package.json`): Changed `electron:dev` script from `concurrently "vite" "wait-on... && electron ."` to just `"vite"` since vite-plugin-electron handles Electron launch automatically
- **Recording Timer Fix**: Changed from `prev => prev + 1` callback to direct `getState()` read from Zustand

### Files Created
- `src/components/PlatformSidebar.tsx`
- `src/components/ChatPanel.tsx`
- `src/components/TicketsView.tsx`

### Files Modified
- `package.json` — fixed electron:dev script
- `src/types/index.ts` — added globalRules, Ticket types, ChatMessage, expanded electronAPI
- `src/stores/appStore.ts` — per-platform cache, sidebar state, chat state, ticket state
- `src/services/llmService.ts` — global rules prepending, chatWithAI multi-turn function
- `src/services/speechService.ts` — AudioContext analyser, visualization methods
- `electron/main.ts` — paste-to-external IPC, tickets IPC, global rules default, larger window
- `electron/preload.ts` — pasteToExternal, getTickets, saveTickets bridge methods
- `src/App.tsx` — sidebar + content layout, tickets routing
- `src/components/MainView.tsx` — action bar, per-platform caching, chat panel, volume meter, parallel processing
- `src/components/PromptsView.tsx` — global rules card, chat modify button per platform
- `src/components/Header.tsx` — added Tickets nav item

---

## 2026-03-01 — Session 1: Initial Build

### Features Added
- Complete app scaffold: Electron + React + Vite + Tailwind + TypeScript
- All 5 original views: Main, Settings, Dictionary, Learning, Prompts
- Speech recording via Web Audio API
- Transcription: Whisper, Deepgram, Browser Web Speech, Gemini
- LLM text processing: Gemini, Claude, OpenAI
- Platform-specific prompt system with 7 defaults
- Dictionary word replacement system
- Learning pattern extraction from user edits
- Electron IPC bridge with context isolation
- Data persistence in %AppData%\voicetype-data\
- Focus mode, history, cursor append
