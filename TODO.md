# VoiceType - TODO

## Priority: Critical (Ship Blockers)
- [ ] Fix first-press blank indicator (pre-create window on app start, keep hidden)
- [ ] Build API proxy server so users don't need their own API keys
- [ ] Supabase auth system (user accounts, subscription status)
- [ ] Stripe subscription integration ($19.95/mo or $89/yr)
- [ ] License verification check on app launch
- [ ] Windows code signing certificate (prevents "unknown publisher" warning)
- [ ] Auto-updater via electron-updater + GitHub Releases
- [ ] Package .exe installer with electron-builder (NSIS)
- [ ] App icon and branding

## Priority: High (Before Public Release)
- [ ] Make audio bars reactive to actual mic input (pipe analyser data to indicator)
- [ ] System tray icon — run in background, show/hide from tray
- [ ] Onboarding flow — first-launch setup wizard (create account, enter payment)
- [ ] Error handling for API failures, no mic access, network issues
- [ ] Usage tracking + rate limiting on API proxy
- [ ] Landing page with Stripe checkout + download link
- [ ] Android version (React Native / Expo port) — Play Store listing ($25 one-time fee)

## Priority: Medium (Post-Launch Polish)
- [ ] Demo video / product walkthrough for marketing
- [ ] Reactive volume meter in indicator overlay
- [ ] Voice command shortcuts ("new paragraph", "delete that")
- [ ] Streaming transcription with Deepgram (real-time)
- [ ] Export transcription history
- [ ] Template system for common text patterns

## Priority: Low (Future Ideas)
- [ ] Mac version
- [ ] iOS version
- [ ] Configurable language for speech recognition
- [ ] Learning mode confidence threshold
- [ ] Notification when transcription completes

## Completed
- [x] Scaffold entire app (Electron + React + Vite + Tailwind)
- [x] Build all views (Main, Settings, Dictionary, Modes, Learning)
- [x] Speech recording service with GainNode + volume analyser
- [x] Whisper + Deepgram + Gemini + Browser transcription
- [x] Gemini + Claude + OpenAI LLM text processing
- [x] Dictionary word replacements
- [x] Learning pattern system
- [x] 3 dictation modes (Clean, Professional, Casual)
- [x] Electron IPC data persistence
- [x] Fix overlay architecture (moved to main.tsx, separate component trees)
- [x] Re-implement mic gain slider (0-200%, GainNode in audio chain)
- [x] Re-implement mode cycling in overlay indicator
- [x] Configurable hotkey system (Right Alt default, dropdown in settings)
- [x] Hold-to-record + double-tap hands-free
- [x] Floating indicator redesign (mic icon, audio bars, mode badge, LIVE dot)
- [x] Fix white box overlay bug (transparent body for indicator window)
- [x] Improve LLM prompts for transcription accuracy
- [x] Git repo + GitHub remote (ConnectorOfKnowledge/VoiceType)
