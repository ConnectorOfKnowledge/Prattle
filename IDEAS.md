# Prattle (formerly VoiceType) - Ideas Parking Lot

## Brand & Name
- **Final name: Prattle** — meaning "to talk casually/informally at length." Perfect fit: you prattle into the mic, AI makes it polished.
- **Tagline ideas:** "Go ahead and prattle. We'll make it perfect." / "Speak naturally. Get perfect text."
- **Previous name VoiceType** — abandoned due to direct competitor at voicetype.com ($11.59/mo)
- **Domain to check:** prattle.app, getprattle.com, prattle.io, useprattle.com

## Business Model
- **Subscription:** $9.95/month or $69.95/year (save 42%)
- **Free tier:** Bring your own API keys (existing behavior, no account needed)
- **Paid tier:** We provide the AI backend, no keys needed
- **API proxy server** on Vercel routes through our API keys, tracks usage
- **Estimated cost per active user:** $1-2/month (Gemini), $5-6/month (Whisper + Claude)
- **Margin at $9.95/mo:** $5-8/user after Stripe fees
- **Break-even:** 3-4 monthly subscribers covers $21/mo fixed costs (Vercel Pro + domain)

## Competitor Alert
- **VoiceType AI** (voicetype.com) — Direct competitor, same concept, $11.59/mo, works across apps
- **Wispr Flow** — Premium positioning, $10/mo, Mac-first
- **Aqua Voice** — Clean design, command-based, Mac + Windows
- Our unique angle: BYOK free tier (no competitor offers this)

## Multi-Platform Strategy
- **Windows desktop** (current) — Electron, .exe installer
- **Android** — React Native / Expo port for Play Store ($25 dev account)
- **Mac** — Electron builds for Mac (same codebase, just need code signing)
- **iOS** — Needs Apple Developer account ($99/yr)
- **Web app** — Browser-only version (no hotkey, but mic button works)

## Distribution Channels
- **Own website** — Landing page + download link + in-app subscription
- **GitHub Releases** — Auto-updater serves updates from here
- **Microsoft Store** — Wider reach for Windows users (future)
- **Google Play Store** — Android version (future)

## Marketing Ideas
- "Prattle vs Windows Dictation" comparison content
- Demo video showing hold-to-talk → instant typed text workflow
- Target audiences: writers, students, professionals with RSI, accessibility users
- Reddit (r/productivity, r/speechrecognition), Twitter/X, TikTok demos
- SEO landing page targeting "voice to text app for windows"
- Affiliate/referral program
- Lean into the name: "Don't type — prattle."

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

## Landing Page Enhancements
- Add testimonials section (once we have users)
- Add social proof logos (once we have notable users)
- Add email signup for Mac/Linux waitlist
- Add live demo widget (record in browser, show before/after)
- A/B test CTA button text
- Add video walkthrough to hero section
