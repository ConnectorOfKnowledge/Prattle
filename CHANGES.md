# VoiceType - Change Log

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
