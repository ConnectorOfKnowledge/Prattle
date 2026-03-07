# Prattle (formerly VoiceType) - TODO

## Priority: Critical (Before Going Live)
- [ ] Register a domain (prattle.app, getprattle.com, etc.)
- [ ] Create Stripe account + two products (Monthly $9.95, Annual $69.95)
- [ ] Run supabase/migration.sql in Supabase SQL Editor
- [ ] Set env vars on Vercel (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE keys, price IDs)
- [ ] Update placeholder values in Electron app code:
  - authService.ts — SUPABASE_URL, SUPABASE_ANON_KEY, PROXY_BASE
  - proxyService.ts — PROXY_BASE domain
  - AccountView.tsx — Stripe price IDs
- [ ] Rebrand Electron app internally (VoiceType → Prattle references, app name, tray tooltip, installer name)
- [ ] Rebuild .exe with real credentials + Prattle branding
- [ ] End-to-end test: install → sign up → subscribe → dictate via proxy → manage subscription
- [ ] Windows code signing certificate (prevents "unknown publisher" warning)

## Priority: High (Before Public Release)
- [ ] Rename GitHub repo (VoiceType → Prattle)
- [ ] Onboarding flow — first-launch setup wizard
- [ ] Error handling for API failures, no mic access, network issues
- [ ] Demo video / product walkthrough for landing page
- [ ] Make audio bars reactive to actual mic input (pipe analyser data to indicator)

## Priority: Medium (Post-Launch Polish)
- [ ] Voice command shortcuts ("new paragraph", "delete that")
- [ ] Streaming transcription with Deepgram (real-time)
- [ ] Export transcription history
- [ ] Template system for common text patterns
- [ ] Reactive volume meter in indicator overlay
- [ ] Android version (React Native / Expo)

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
- [x] Fix overlay architecture (moved to main.tsx)
- [x] Re-implement mic gain slider (0-200%)
- [x] Re-implement mode cycling in overlay indicator
- [x] Configurable hotkey system (Right Alt default)
- [x] Hold-to-record + double-tap hands-free
- [x] Floating indicator redesign
- [x] System tray icon + run in background
- [x] Auto-start on login
- [x] Auto-updater via electron-updater + GitHub Releases
- [x] Package .exe installer (NSIS, 97 MB)
- [x] App icon and branding
- [x] Supabase auth system (user accounts, subscription status)
- [x] Stripe subscription integration ($9.95/mo, $69.95/yr)
- [x] API proxy server (Next.js on Vercel)
- [x] Proxy vs BYOK routing in Electron app
- [x] Auth views (AuthView, AccountView)
- [x] Landing page (Direction B design: warm cream, serif, amber/teal)
- [x] Download page with system requirements
- [x] Pricing section with monthly/annual toggle
- [x] FAQ section with 8 questions
- [x] Rebrand landing page from VoiceType to Prattle (47 references across 13 files)
- [x] Deploy landing page to Vercel (https://voicetype-web.vercel.app)
- [x] Research alternative product names (chose "Prattle")
