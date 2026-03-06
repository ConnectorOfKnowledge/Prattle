# VoiceType - Ideas Parking Lot

## Business Model
- **Subscription:** $19.95/month or $89/year (competitor charges $30/mo or $100/yr)
- **We provide the API backend** — users don't need their own keys
- **API proxy server** routes through our Whisper/Gemini keys, tracks usage
- **Estimated cost per active user:** $5-8/month (heavy), $2-3/month (light)
- **Margin at $19.95/mo:** $12-15/user on heavy users, more on light users
- **Margin at $89/yr ($7.42/mo):** Tighter but works for light-moderate users

## Multi-Platform Strategy
- **Windows desktop** (current) — Electron, .exe installer
- **Android** — React Native / Expo port for Play Store ($25 dev account)
- **Mac** — Electron builds for Mac (same codebase, just need code signing)
- **iOS** — Needs Apple Developer account ($99/yr)
- **Web app** — Browser-only version (no hotkey, but mic button works)
- Use this as the first app to establish developer accounts on Play Store, App Store, etc.
- Once accounts are set up, can publish other apps too

## Distribution Channels
- **Own website** — Landing page + Stripe checkout + direct download
- **Gumroad** — Indie software marketplace, handles payments and delivery
- **Microsoft Store** — Wider reach for Windows users
- **Google Play Store** — Android version
- **Apple App Store** — iOS version (future)

## Marketing Ideas
- "VoiceType vs Windows Dictation" comparison content
- Demo video showing hold-to-talk → instant typed text workflow
- Target audiences: writers, students, professionals with RSI, accessibility users
- Reddit (r/productivity, r/speechrecognition), Twitter/X, TikTok demos
- SEO landing page targeting "voice to text app for windows"
- Free trial (7-14 days) to reduce friction
- Affiliate/referral program

## Future Features
- Dark/light theme toggle (setting exists but not fully implemented)
- Voice command shortcuts ("new paragraph", "delete that", "undo")
- Template system for common patterns (email signatures, greetings)
- Streaming transcription with Deepgram (real-time text as you speak)
- Overlay window size/position memory
- Learning mode confidence threshold
- Learning mode undo/review queue
- Word count / character count display
- Export transcription history
- Auto-save drafts between sessions
- Batch reprocess when mode prompt changes
- Keyboard shortcuts for mode switching

## Technical Improvements
- Pre-create indicator window on app start (hidden) to eliminate first-press flash
- Pipe actual audio analyser data to indicator window for reactive bars
- Use `diff` library more actively for pattern extraction
- Show confidence scores from transcription
- Better error recovery with retry logic for API calls
- Consider WebSocket for streaming audio to API proxy

## Architecture Notes
- Indicator detection lives in main.tsx (separate component tree from App)
- Transparent overlay achieved by clearing body background + classes for indicator window
- Hotkey system uses uiohook-napi with configurable key mapping and double-tap detection
- Audio chain: MediaStream → GainNode → AnalyserNode
- For Android port: no global hotkey possible, would need a floating bubble or notification bar button
