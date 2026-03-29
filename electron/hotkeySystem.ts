import { uIOhook, UiohookKey } from 'uiohook-napi'
import { readJsonFile } from './dataStore'
import { startForegroundTracking, stopForegroundTracking } from './foregroundTracker'

// Map friendly key names to uiohook keycodes
export const KEY_NAME_TO_KEYCODE: Record<string, number> = {
  'Space': UiohookKey.Space,
  'Insert': UiohookKey.Insert,
  'Delete': UiohookKey.Delete,
  'Home': UiohookKey.Home,
  'End': UiohookKey.End,
  'PageUp': UiohookKey.PageUp,
  'PageDown': UiohookKey.PageDown,
  'Pause': 0xE046, // Pause/Break key (not in UiohookKey enum)
  'ScrollLock': UiohookKey.ScrollLock,
  'PrintScreen': UiohookKey.PrintScreen,
  'F1': UiohookKey.F1,
  'F2': UiohookKey.F2,
  'F3': UiohookKey.F3,
  'F4': UiohookKey.F4,
  'F5': UiohookKey.F5,
  'F6': UiohookKey.F6,
  'F7': UiohookKey.F7,
  'F8': UiohookKey.F8,
  'F9': UiohookKey.F9,
  'F10': UiohookKey.F10,
  'F11': UiohookKey.F11,
  'F12': UiohookKey.F12,
  'RightAlt': UiohookKey.AltRight,
  'RightCtrl': UiohookKey.CtrlRight,
  'RightShift': UiohookKey.ShiftRight,
}

export interface HotkeyConfig {
  requireCtrl: boolean
  requireShift: boolean
  requireAlt: boolean
  triggerKeycode: number
}

// ---- Hotkey state tracking ----
let ctrlDown = false
let shiftDown = false
let altDown = false
let triggerKeyDown = false
let triggerKeyDownSince = 0 // timestamp when trigger was pressed
let lastTriggerPressTime = 0
let isHoldRecording = false
let isHandsFreeMode = false
let stopDelayTimeout: ReturnType<typeof setTimeout> | null = null
let hookHealthInterval: ReturnType<typeof setInterval> | null = null

// Hook liveness tracking: last time any keydown/keyup event was received
// Windows silently de-registers low-level hooks after extended sessions if the
// callback is too slow. We track this to detect hook death and restart.
let lastHookEventTime = Date.now()
let hookRestartCallbacks: HotkeyCallbacks | null = null

const DOUBLE_TAP_WINDOW = 400 // ms
const STOP_DELAY = 250 // ms
const STUCK_KEY_TIMEOUT = 10_000 // ms -- if trigger key is "held" longer than this, assume missed keyup
// If no keyboard events at all for 5 minutes, assume the hook was silently removed by Windows
const HOOK_SILENCE_THRESHOLD = 5 * 60 * 1000 // 5 minutes in ms

let activeHotkey: HotkeyConfig = {
  requireCtrl: false,
  requireShift: false,
  requireAlt: false,
  triggerKeycode: UiohookKey.AltRight,
}

export function parseHotkeyString(hotkey: string): HotkeyConfig {
  const parts = hotkey.split('+').map(p => p.trim())
  const config: HotkeyConfig = {
    requireCtrl: false,
    requireShift: false,
    requireAlt: false,
    triggerKeycode: UiohookKey.AltRight,
  }

  // Last part is the trigger key, everything before is modifiers
  const triggerName = parts.pop() || 'RightAlt'
  for (const mod of parts) {
    const lower = mod.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') config.requireCtrl = true
    else if (lower === 'shift') config.requireShift = true
    else if (lower === 'alt') config.requireAlt = true
  }

  // Look up the trigger keycode
  config.triggerKeycode = KEY_NAME_TO_KEYCODE[triggerName] ?? UiohookKey.AltRight

  return config
}

function modifiersMatch(): boolean {
  if (activeHotkey.requireCtrl && !ctrlDown) return false
  if (activeHotkey.requireShift && !shiftDown) return false
  if (activeHotkey.requireAlt && !altDown) return false
  return true
}

interface HotkeyCallbacks {
  sendToRenderer: (channel: string, ...args: unknown[]) => void
  sendToIndicator: (channel: string, ...args: unknown[]) => void
  showIndicator: () => void
}

export function setupHotkeySystem(callbacks: HotkeyCallbacks): void {
  const { sendToRenderer, sendToIndicator, showIndicator } = callbacks

  // Load hotkey from settings
  const settings = readJsonFile('settings.json')
  const hotkeyStr = (settings.hotkey as string) || 'RightAlt'
  activeHotkey = parseHotkeyString(hotkeyStr)
  console.log(`[Prattle] Hotkey set to: ${hotkeyStr} (keycode ${activeHotkey.triggerKeycode})`)

  uIOhook.on('keydown', (e) => {
    // Update hook liveness timestamp on every event
    lastHookEventTime = Date.now()

    // Track modifier states (always, regardless of hotkey config)
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = true
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = true
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = true

    // Check if trigger key pressed
    if (e.keycode === activeHotkey.triggerKeycode) {
      if (triggerKeyDown) {
        // If the key has been "held" for an unreasonable time, it's a stuck state from a missed keyup
        if (triggerKeyDownSince > 0 && (Date.now() - triggerKeyDownSince) > STUCK_KEY_TIMEOUT) {
          console.log('[Prattle] Detected stuck trigger key state -- resetting')
          triggerKeyDown = false
          isHoldRecording = false
        } else {
          return // Genuine key repeat, ignore
        }
      }
      triggerKeyDown = true
      triggerKeyDownSince = Date.now()

      // Check if required modifiers are held
      if (!modifiersMatch()) return

      const now = Date.now()
      const timeSinceLastPress = now - lastTriggerPressTime
      lastTriggerPressTime = now

      if (timeSinceLastPress < DOUBLE_TAP_WINDOW) {
        // Double-tap detected
        const stopAlreadyFired = !stopDelayTimeout
        if (stopDelayTimeout) {
          clearTimeout(stopDelayTimeout)
          stopDelayTimeout = null
        }

        // Toggle hands-free mode
        if (isHandsFreeMode) {
          // Stop hands-free recording
          isHandsFreeMode = false
          isHoldRecording = false
          stopForegroundTracking()
          sendToRenderer('recording-command', 'stop')
          sendToIndicator('recording-command', 'stop')
        } else {
          // Start hands-free recording
          isHandsFreeMode = true
          isHoldRecording = false

          if (stopAlreadyFired) {
            startForegroundTracking(sendToIndicator, sendToRenderer)
            sendToRenderer('recording-command', 'start-handsfree')
          }
          showIndicator()
          sendToIndicator('recording-command', 'start-handsfree')
        }
      } else if (!isHandsFreeMode) {
        // Single press: start hold-to-record
        isHoldRecording = true
        startForegroundTracking(sendToIndicator, sendToRenderer)
        sendToRenderer('recording-command', 'start')
        showIndicator()
        sendToIndicator('recording-command', 'start')
      }
    }
  })

  uIOhook.on('keyup', (e) => {
    // Update hook liveness timestamp on every event
    lastHookEventTime = Date.now()

    // Track modifier states
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = false
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = false
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = false

    // Check if trigger key released
    if (e.keycode === activeHotkey.triggerKeycode) {
      triggerKeyDown = false
      triggerKeyDownSince = 0

      if (isHoldRecording && !isHandsFreeMode) {
        sendToRenderer('recording-command', 'stop-capture')

        // Delay the full stop to allow double-tap detection
        stopDelayTimeout = setTimeout(() => {
          stopDelayTimeout = null
          if (isHoldRecording && !isHandsFreeMode) {
            isHoldRecording = false
            stopForegroundTracking()
            sendToRenderer('recording-command', 'stop')
            sendToIndicator('recording-command', 'stop')
          }
        }, STOP_DELAY)
      }
    }
  })

  // Store callbacks for use in hook restart
  hookRestartCallbacks = callbacks

  try {
    uIOhook.start()
    lastHookEventTime = Date.now()
    console.log('[Prattle] uIOhook started successfully -- global hotkey active')
  } catch (err) {
    console.error('[Prattle] FAILED to start uIOhook:', err)
    // Notify the renderer so the user knows
    setTimeout(() => {
      sendToRenderer('update-status', 'error',
        'Global hotkey failed to initialize. Try running Prattle as administrator.')
    }, 3000)
  }

  // Periodic watchdog: detect and recover from stuck state AND silent hook removal
  // Windows can silently remove low-level hooks if the callback takes too long or
  // after extended use sessions. We detect this via event silence and restart the hook.
  hookHealthInterval = setInterval(() => {
    const now = Date.now()

    // If trigger key appears stuck, reset it
    if (triggerKeyDown && triggerKeyDownSince > 0 && (now - triggerKeyDownSince) > STUCK_KEY_TIMEOUT) {
      console.log('[Prattle] Watchdog: trigger key stuck for >10s -- resetting state')
      triggerKeyDown = false
      triggerKeyDownSince = 0
      if (isHoldRecording && !isHandsFreeMode) {
        isHoldRecording = false
        stopForegroundTracking()
        sendToRenderer('recording-command', 'stop')
        sendToIndicator('recording-command', 'stop')
      }
    }

    // Reset modifier tracking periodically to prevent phantom stuck modifiers
    ctrlDown = false
    shiftDown = false
    altDown = false

    // Detect silent hook removal: if no keyboard events for the silence threshold,
    // Windows likely de-registered the hook. Restart uIOhook to restore hotkeys.
    if (now - lastHookEventTime > HOOK_SILENCE_THRESHOLD) {
      console.warn('[Prattle] Watchdog: no keyboard events for 5+ minutes -- restarting uIOhook')
      try {
        uIOhook.stop()
      } catch (_) { /* ignore */ }
      try {
        uIOhook.start()
        lastHookEventTime = now
        console.log('[Prattle] Watchdog: uIOhook restarted successfully')
      } catch (err) {
        console.error('[Prattle] Watchdog: failed to restart uIOhook:', err)
      }
    }
  }, 30_000) // Every 30 seconds
}

export function updateHotkey(hotkey: string): void {
  activeHotkey = parseHotkeyString(hotkey)
  // Reset state to avoid stuck keys
  triggerKeyDown = false
  isHoldRecording = false
  isHandsFreeMode = false
  console.log(`[Prattle] Hotkey updated to: ${hotkey} (keycode ${activeHotkey.triggerKeycode})`)
}

export function stopHotkeySystem(): void {
  if (hookHealthInterval) {
    clearInterval(hookHealthInterval)
    hookHealthInterval = null
  }
  try { uIOhook.stop() } catch (_) { /* uIOhook may not be running */ }
}
