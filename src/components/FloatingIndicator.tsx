import { useState, useEffect, useCallback, useRef } from 'react'
import { DICTATION_MODES } from '../constants/modes'
import type { RecordingState } from '../constants/modes'
import type { Settings } from '../types'

export default function FloatingIndicator() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [modeIndex, setModeIndex] = useState(0)
  const [duration, setDuration] = useState(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Listen for recording commands from main process
  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand((command: string) => {
      // Clear any pending hide timer when a new command comes in
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }

      switch (command) {
        case 'start':
        case 'start-handsfree':
          setRecordingState('recording')
          setDuration(0)
          break
        case 'start-rewrite':
          setRecordingState('rewrite_recording')
          setDuration(0)
          break
        case 'stop':
          setRecordingState('processing')
          // Show "Processing..." briefly, then hide the window entirely
          hideTimerRef.current = setTimeout(() => {
            setRecordingState('idle')
            window.electronAPI?.hideIndicator()
          }, 3000)
          break
      }
    })

    return cleanup
  }, [])

  // Load mode index from settings
  useEffect(() => {
    window.electronAPI?.getSettings().then((settings: Settings) => {
      if (settings?.currentModeIndex !== undefined) {
        setModeIndex(settings.currentModeIndex)
      }
    })
  }, [])

  // Cycle through dictation modes on click
  const handleCycleMode = useCallback(async () => {
    const nextIndex = (modeIndex + 1) % DICTATION_MODES.length
    setModeIndex(nextIndex)

    try {
      const settings = await window.electronAPI.getSettings()
      if (settings) {
        await window.electronAPI.saveSettings({ ...settings, currentModeIndex: nextIndex })
      }
    } catch (e) {
      console.error('Failed to save mode change:', e)
    }
  }, [modeIndex])

  // Duration timer
  useEffect(() => {
    if (recordingState === 'recording' || recordingState === 'rewrite_recording') {
      const timer = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [recordingState])

  const isRecording = recordingState === 'recording' || recordingState === 'rewrite_recording'
  const isRewrite = recordingState === 'rewrite_recording'
  const isProcessing = recordingState === 'processing'

  // When idle, render nothing — the window is hidden by main process
  if (recordingState === 'idle') {
    return null
  }

  const mode = DICTATION_MODES[modeIndex]
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  // Colors
  const accentColor = isRewrite ? '#A78BFA' : '#EF4444'
  const accentGlow = isRewrite ? 'rgba(167, 139, 250, 0.4)' : 'rgba(239, 68, 68, 0.4)'

  return (
    <div
      className="w-full h-full flex items-center select-none"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 15, 20, 0.95) 0%, rgba(25, 20, 35, 0.95) 100%)',
        borderRadius: '16px',
        border: `1.5px solid ${isProcessing ? 'rgba(255,255,255,0.08)' : accentColor + '50'}`,
        boxShadow: isRecording
          ? `0 0 30px ${accentGlow}, 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: '0 16px',
      }}
    >
      {/* Left section: Mic icon or spinner */}
      <div className="flex items-center justify-center" style={{ width: 32, height: 32 }}>
        {isRecording && (
          <div className="relative flex items-center justify-center" style={{ width: 32, height: 32 }}>
            {/* Pulsing ring behind mic */}
            <div
              style={{
                position: 'absolute',
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `2px solid ${accentColor}40`,
                animation: 'pulse-ring 2s ease-out infinite',
              }}
            />
            {/* Mic icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 1 }}>
              <rect x="9" y="2" width="6" height="12" rx="3" fill={accentColor} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={accentColor} strokeWidth="2" strokeLinecap="round" fill="none" />
              <line x1="12" y1="18" x2="12" y2="22" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {isProcessing && (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '2.5px solid rgba(255,255,255,0.15)',
              borderTopColor: 'rgba(255,255,255,0.6)',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        )}
      </div>

      {/* Audio bars (animated when recording) */}
      {isRecording && (
        <div className="flex items-center gap-[3px] mx-2" style={{ height: 24 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                width: 3,
                borderRadius: 2,
                backgroundColor: accentColor,
                opacity: 0.7,
                animation: `audio-bar 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Center section: Mode + Duration */}
      <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
        {/* Mode badge — clickable to cycle */}
        <button
          onClick={handleCycleMode}
          className="text-[12px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap"
          style={{
            color: isProcessing ? 'rgba(255,255,255,0.4)' : accentColor,
            backgroundColor: isProcessing ? 'transparent' : accentColor + '18',
            border: `1px solid ${isProcessing ? 'transparent' : accentColor + '30'}`,
          }}
          title="Click to switch mode"
        >
          {mode?.name || 'Clean'}
        </button>

        {/* Duration */}
        {isRecording && (
          <>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
            <span
              className="text-[14px] font-mono font-semibold tabular-nums tracking-wide"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {formatTime(duration)}
            </span>
          </>
        )}

        {isProcessing && (
          <span className="text-[12px] text-white/30 font-medium tracking-wide">
            Processing...
          </span>
        )}
      </div>

      {/* Right section: live dot */}
      {isRecording && (
        <div className="flex items-center gap-1.5">
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: accentColor,
              boxShadow: `0 0 6px ${accentColor}`,
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
            Live
          </span>
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes audio-bar {
          0%, 100% { height: 4px; }
          50% { height: 18px; }
        }
      `}</style>
    </div>
  )
}
