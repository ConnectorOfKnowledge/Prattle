# VoiceType - Project Status

## What It Is
A desktop voice-to-text notepad built with Electron + React + Vite + Tailwind + TypeScript.
You speak, it transcribes via Whisper/Deepgram/Gemini/Browser, cleans the text with an LLM (Gemini/Claude/OpenAI) using platform-specific prompts, and you edit + copy when ready. Includes a platform sidebar, AI chat modifier, ticket system, learning engine, and a global hotkey overlay for quick access.

## Tech Stack
- **Desktop:** Electron 34.2
- **Frontend:** React 18.3 + TypeScript 5.7
- **Build:** Vite 6.1 + vite-plugin-electron + electron-builder
- **Styling:** Tailwind CSS 3.4
- **State:** Zustand 5.0
- **APIs:** OpenAI (Whisper + GPT), Deepgram, Google Gemini, Anthropic Claude

## Current State (2026-03-01, Session 4)
**Status: Feature-rich, builds clean, reverted to stable baseline after overlay regression**

### What Happened in Session 4
Attempted to add two features (platform dropdown in overlay, mic gain slider in settings). Changes broke the overlay window — it rendered as a blank white window (React failed to mount). After extensive debugging, all changes from Session 4 were **fully reverted** back to the Session 3 stable state. The two features (platform dropdown + mic gain) are now parked as future tickets.

### What's Built & Working
- [x] App launches and renders correctly (double-window bug fixed)
- [x] Header navigation (Dictate, Platforms, Dictionary, Learning, Tickets, Settings)
- [x] **MainView:** mic button, recording timer, text area, action bar (Copy/Paste/Clear/Redo/Modify)
- [x] **Platform Sidebar:** vertical sidebar on left showing all enabled platforms with text previews
- [x] **Simultaneous Processing:** all platforms process in parallel after recording, sidebar previews populate together
- [x] **Per-platform text caching:** switching platforms saves/restores edited text
- [x] **Paste to External:** minimizes VoiceType, Ctrl+V into previous window, restores
- [x] **Chat/Modify Panel:** AI chat to refine output text (MainView) or improve prompt templates (PromptsView)
- [x] **Global Rules:** cross-platform text rules applied to all processing (default: filler word removal)
- [x] **Ticket System:** in-app feature/change tracker with add/edit/delete/status toggle/filters
- [x] **Ticket Email Export:** generates formatted report of all tickets, copy to clipboard
- [x] **Volume Meter:** 24-bar frequency visualization during recording (green/amber/red)
- [x] **Global HotKey Overlay:** Ctrl+Shift+Space opens 380x220 always-on-top overlay with Record/Copy/Paste
- [x] **Learning Mode:** auto-detects word corrections on edit+copy, adds to dictionary automatically
- [x] **Focus Mode:** distraction-free recording/editing (hides sidebar, header, extras)
- [x] **History:** recent copies accessible from main view
- [x] **Cursor Append:** new recordings insert at cursor position in existing text
- [x] SettingsView: provider selection, API key management, preferences, hotkey config, learning mode toggle
- [x] DictionaryView: add/edit/delete word replacements, import/export
- [x] LearningView: view/manage auto-learned and manual patterns, active/inactive status banner
- [x] PromptsView: customize platform prompts, create custom platforms, global rules
- [x] SpeechService: audio recording + AudioContext analyser for volume visualization
- [x] Transcription: Whisper API, Deepgram API, Gemini API, Browser Web Speech
- [x] LLM processing: Gemini, Claude, OpenAI with platform-specific prompts + global rules
- [x] Dictionary: case-insensitive whole-word replacement before AI processing
- [x] Learning: analyze edits via LLM, extract reusable patterns
- [x] Data persistence: all settings/data as JSON in %AppData%\voicetype-data
- [x] Electron IPC bridge with context isolation

### What's NOT Built Yet
- [ ] Git repo initialization
- [ ] Dark mode
- [ ] Mic gain/volume slider (attempted Session 4, reverted)
- [ ] Platform dropdown in overlay (attempted Session 4, reverted)

### Known Issues
- Recording timer: fixed with direct Zustand getState() pattern
- GPU cache warnings when running from Google Drive (cosmetic only)
- **Overlay window architecture:** The overlay detection lives in App.tsx as an early return before hooks. This technically violates React Rules of Hooks but works because `isOverlay` is a static module-level constant. Be cautious when modifying OverlayView.tsx or App.tsx — changes in Session 4 caused silent React crashes. Future changes to the overlay should be tested carefully and may benefit from moving overlay detection to main.tsx.

### Untested
- Full recording -> transcription -> AI processing -> copy workflow (needs API keys)
- All API integrations (Whisper, Deepgram, Gemini, Claude, OpenAI)
- Paste to external window (PowerShell SendKeys approach)
- Chat/Modify panel with actual LLM responses
- Learning pattern auto-extraction and auto-dictionary additions
- Volume meter with live microphone
- Global hotkey overlay from external apps
- Learning mode correction detection accuracy

## Key Files
```
VoiceType/
├── electron/main.ts              # Electron main process, IPC handlers, data storage, overlay window, hotkeys
├── electron/preload.ts            # Context bridge (electronAPI)
├── src/
│   ├── App.tsx                    # Root component, view routing, sidebar layout, overlay detection
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Tailwind + custom styles
│   ├── types/index.ts             # TypeScript interfaces + window.electronAPI declaration
│   ├── stores/appStore.ts         # Zustand global state (per-platform cache, chat, tickets, learning)
│   ├── services/
│   │   ├── speechService.ts       # Audio recording, analyser, Whisper/Deepgram/Gemini/Browser
│   │   └── llmService.ts          # LLM calls, global rules, multi-turn chat, pattern analysis
│   └── components/
│       ├── Header.tsx             # Navigation bar (6 views)
│       ├── MainView.tsx           # Recording + editing + action bar + volume meter
│       ├── PlatformSidebar.tsx    # Vertical sidebar with platform list + text previews
│       ├── ChatPanel.tsx          # Reusable AI chat panel for text/prompt modification
│       ├── OverlayView.tsx        # Compact always-on-top overlay (Record/Copy/Paste)
│       ├── TicketsView.tsx        # Ticket CRUD + filters + email export
│       ├── SettingsView.tsx       # API keys, providers, preferences, hotkey config, learning toggle
│       ├── DictionaryView.tsx     # Word replacement CRUD
│       ├── LearningView.tsx       # Pattern management + learning mode status banner
│       └── PromptsView.tsx        # Platform prompt customization + global rules
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Data Storage
All user data stored in: `%AppData%\voicetype-data\`
- `settings.json` - API keys, provider choices, preferences, globalRules, hotkey config, learning mode
- `platform-prompts.json` - Platform configurations (7 defaults)
- `dictionary.json` - Word replacements
- `learned-patterns.json` - Auto + manual patterns
- `tickets.json` - Feature request/change tickets
