# VoiceType - Ideas Parking Lot

## Future Features
- Dark mode (theme setting exists in types but not implemented)
- Configurable language for speech recognition (currently hardcoded to English)
- Word count / character count display
- Export transcription history to file
- System tray mode (decided against for v1, but could revisit)
- Auto-save drafts between sessions
- Notification when transcription completes (useful in overlay/floating mode)
- Voice command shortcuts ("new paragraph", "delete that", etc.)
- Template system for common text patterns (email signatures, greetings)
- Overlay window size/position memory (remember where user last placed it)
- Overlay window custom hotkey (let user pick their own shortcut beyond Ctrl+Shift+Space)
- Learning mode confidence threshold (only auto-add corrections above a certain confidence)
- Learning mode undo/review queue (review recent auto-learned corrections before they become permanent)

## Potential Improvements
- Use the `diff` library (already a dependency) more actively for pattern extraction
- Streaming transcription with Deepgram (it supports real-time)
- Show confidence scores from transcription
- Better error recovery with retry logic for API calls
- Batch reprocess all platforms when global rules change
- Keyboard shortcuts for platform switching (Ctrl+1, Ctrl+2, etc.)
- Resizable sidebar width
- Platform drag-and-drop reordering
- Ticket categories/tags
- Ticket export to CSV/JSON
- Overlay could show a mini volume meter during recording
- Learning mode could track correction frequency to prioritize dictionary entries

## Architecture Notes for Future Overlay Work
- The overlay detection currently lives in App.tsx as an early return before hooks. This is fragile.
- When re-implementing overlay features (platform dropdown, mic gain), consider moving overlay detection to main.tsx to render OverlayView as a completely separate component tree — avoids any hooks ordering issues.
- The blank overlay bug in Session 4 may have been caused by new useState calls + dependency array changes in OverlayView.tsx, not the hooks violation in App.tsx. Test overlay changes incrementally.
