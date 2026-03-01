# VoiceType - TODO

## Priority: High
- [ ] Add API keys and test full workflow end-to-end
- [ ] Test paste-to-external window feature
- [ ] Test chat/modify panel with real LLM responses
- [ ] Test volume meter with live microphone
- [ ] Test simultaneous platform processing (verify all previews populate)
- [ ] Test global hotkey overlay (Ctrl+Shift+Space from external apps)
- [ ] Test learning mode correction detection (edit text, copy, verify dictionary addition)
- [ ] Initialize git repo + first commit

## Priority: Medium
- [ ] Platform dropdown in overlay — let user switch platforms from the overlay window (attempted Session 4, reverted due to blank overlay bug — needs careful approach, see Known Issues in PROJECT_STATUS)
- [ ] Mic gain/volume slider in Settings — 0-200% range, GainNode in audio chain (attempted Session 4, reverted along with overlay fix)
- [ ] Test all speech providers (Whisper, Deepgram, Gemini, Browser)
- [ ] Test all LLM providers (Gemini, Claude, OpenAI)
- [ ] Test dictionary import/export
- [ ] Test learning pattern auto-extraction
- [ ] Handle edge cases (no mic access, API failures, empty recordings)

## Priority: Low
- [ ] Dark mode implementation
- [ ] Add keyboard shortcut for copy (Ctrl+Enter?)
- [ ] Consider undo/redo in the text editor
- [ ] Ticket archive/history view (separate from active tickets)
- [ ] GPU cache warnings when running from Google Drive (cosmetic only)

## Completed
- [x] Scaffold entire app (Electron + React + Vite + Tailwind)
- [x] Build all views (Main, Settings, Dictionary, Learning, Prompts, Tickets)
- [x] Implement speech recording service with volume analyser
- [x] Implement Whisper + Deepgram + Gemini + Browser transcription
- [x] Implement Gemini + Claude + OpenAI LLM processing
- [x] Implement dictionary word replacement
- [x] Implement learning pattern system
- [x] Implement platform prompt system with 7 defaults
- [x] Implement Electron IPC data persistence
- [x] First successful app launch (2026-03-01)
- [x] Fix double-window bug (electron:dev script)
- [x] Fix recording timer (Zustand getState pattern)
- [x] Platform sidebar with text previews
- [x] Simultaneous platform processing (all platforms process in parallel)
- [x] Per-platform text caching (preserves edits when switching)
- [x] Paste-to-external button (PowerShell SendKeys)
- [x] Action bar near record button (Copy/Paste/Clear/Redo/Modify)
- [x] Global rules system (cross-platform text rules)
- [x] Default filler word removal global rule
- [x] Chat/Modify panel for text refinement + prompt improvement
- [x] Ticket system (CRUD, status toggle, filters, priority)
- [x] Ticket email export (formatted report, copy to clipboard)
- [x] Microphone volume meter (24-bar frequency visualization)
- [x] Focus mode + history + cursor append
- [x] Global HotKey overlay (Ctrl+Shift+Space, 380x220 always-on-top, Record/Copy/Paste)
- [x] Learning Mode (auto-detect corrections on edit+copy, add to dictionary)
