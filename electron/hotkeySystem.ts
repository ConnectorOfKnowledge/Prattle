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
let lastTriggerPressTime = 0
let isHoldRecording = false
let isHandsFreeMode = false
let stopDelayTimeout: ReturnType<typeof setTimeout> | null = null

const DOUBLE_TAP_WINDOW = 400 // ms
const STOP_DELAY = 250 // ms

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
    // Track modifier states (always, regardless of hotkey config)
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = true
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = true
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = true

    // Check if trigger key pressed
    if (e.keycode === activeHotkey.triggerKeycode) {
      if (triggerKeyDown) return // Already down, ignore repeat
      triggerKeyDown = true

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
    // Track modifier states
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) ctrlDown = false
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shiftDown = false
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) altDown = false

    // Check if trigger key released
    if (e.keycode === activeHotkey.triggerKeycode) {
      triggerKeyDown = false

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

  try {
    uIOhook.start()
    console.log('[Prattle] uIOhook started successfully -- global hotkey active')
  } catch (err) {
    console.error('[Prattle] FAILED to start uIOhook:', err)
    // Notify the renderer so the user knows
    setTimeout(() => {
      sendToRenderer('update-status', 'error',
        'Global hotkey failed to initialize. Try running Prattle as administrator.')
    }, 3000)
  }
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
  try { uIOhook.stop() } catch (_) { /* uIOhook may not be running */ }
}
