import { useState, useEffect, useCallback, useRef } from 'react'
import { DICTATION_MODES } from '../constants/modes'
import type { RecordingState } from '../constants/modes'
import type { Settings } from '../types'

export default function FloatingIndicator() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [modeIndex, setModeIndex] = useState(0)
  const [duration, setDuration] = useState(0)
  const [targetWindow, setTargetWindow] = useState('')

  // Listen for recording commands from main process
  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand((command: string) => {
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
          // Stay visible in processing state until MainView calls hideIndicator
          setRecordingState('processing')
          break
        case 'done':
          // Reset to idle when processing is complete (sent by main process on hide)
          setRecordingState('idle')
          break
      }
    })

    return cleanup
  }, [])

  // Listen for target window updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onTargetWindow) return
    const cleanup = window.electronAPI.onTargetWindow((title: string) => {
      setTargetWindow(title.length > 30 ? title.slice(0, 27) + '...' : title)
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

  // When idle, render nothing
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
      className="w-full h-full flex flex-col items-center justify-center select-none"
      style={{
        background: 'linear-gradient(135deg, rgba(10, 10, 16, 0.96) 0%, rgba(20, 15, 30, 0.96) 100%)',
        borderRadius: '20px',
        border: `1.5px solid ${isProcessing ? 'rgba(96, 165, 250, 0.25)' : accentColor + '50'}`,
        boxShadow: isRecording
          ? `0 0 40px ${accentGlow}, 0 12px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`
          : isProcessing
          ? '0 0 30px rgba(96, 165, 250, 0.15), 0 12px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 12px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: '8px 20px',
      }}
    >
      {/* Top row: main content */}
      <div className="w-full flex items-center">
        {/* Left section: Mic icon or processing wave */}
        <div className="flex items-center justify-center" style={{ width: 36, height: 36 }}>
          {isRecording && (
            <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
              {/* Pulsing ring behind mic */}
              <div
                style={{
                  position: 'absolute',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: `2px solid ${accentColor}40`,
                  animation: 'pulse-ring 2s ease-out infinite',
                }}
              />
              {/* Mic icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 1 }}>
                <rect x="9" y="2" width="6" height="12" rx="3" fill={accentColor} />
                <path d="M5 11a7 7 0 0 0 14 0" stroke={accentColor} strokeWidth="2" strokeLinecap="round" fill="none" />
                <line x1="12" y1="18" x2="12" y2="22" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          )}

          {isProcessing && (
            <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
              {/* Outer ring */}
              <div
                style={{
                  position: 'absolute',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '2.5px solid rgba(96, 165, 250, 0.1)',
                  borderTopColor: 'rgba(96, 165, 250, 0.7)',
                  borderRightColor: 'rgba(147, 130, 255, 0.5)',
                  animation: 'spin 1s linear infinite',
                }}
              />
              {/* Inner ring (counter-rotating) */}
              <div
                style={{
                  position: 'absolute',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: '2px solid rgba(147, 130, 255, 0.1)',
                  borderBottomColor: 'rgba(147, 130, 255, 0.6)',
                  animation: 'spin-reverse 0.8s linear infinite',
                }}
              />
              {/* Center dot */}
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(96, 165, 250, 0.6)',
                  animation: 'pulse-dot 1.5s ease-in-out infinite',
                }}
              />
            </div>
          )}
        </div>

        {/* Audio waveform (animated when recording) */}
        {isRecording && (
          <div className="flex items-center gap-[2px] mx-3" style={{ height: 32 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div
                key={i}
                style={{
                  width: 3,
                  borderRadius: 3,
                  backgroundColor: accentColor,
                  opacity: 0.5 + (i % 3) * 0.15,
                  animation: `audio-bar-${i % 3} 1s ease-in-out ${i * 0.08}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* Processing wave animation */}
        {isProcessing && (
          <div className="flex items-center gap-[3px] mx-3" style={{ height: 24 }}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                style={{
                  width: 3,
                  borderRadius: 3,
                  backgroundColor: `rgba(96, 165, 250, ${0.4 + (i % 3) * 0.15})`,
                  animation: `proc-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* Center section: Mode + Duration */}
        <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
          {/* Mode badge */}
          <button
            onClick={handleCycleMode}
            className="text-[12px] font-bold tracking-wider uppercase px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap"
            style={{
              color: isProcessing ? 'rgba(96, 165, 250, 0.7)' : accentColor,
              backgroundColor: isProcessing ? 'rgba(96, 165, 250, 0.08)' : accentColor + '18',
              border: `1px solid ${isProcessing ? 'rgba(96, 165, 250, 0.15)' : accentColor + '30'}`,
            }}
            title="Click to switch mode"
          >
            {mode?.name || 'Clean'}
          </button>

          {/* Duration */}
          {isRecording && (
            <>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
              <span
                className="text-[16px] font-mono font-semibold tabular-nums tracking-wide"
                style={{ color: 'rgba(255,255,255,0.75)' }}
              >
                {formatTime(duration)}
              </span>
            </>
          )}

          {isProcessing && (
            <span
              className="text-[13px] font-medium tracking-wide"
              style={{
                background: 'linear-gradient(90deg, rgba(96,165,250,0.5), rgba(147,130,255,0.5), rgba(96,165,250,0.5))',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 2s linear infinite',
              }}
            >
              Transcribing...
            </span>
          )}
        </div>

        {/* Right section: target window + live dot */}
        {isRecording && (
          <div className="flex items-center gap-2">
            {targetWindow && (
              <span
                className="text-[10px] font-medium truncate"
                style={{ color: 'rgba(100, 200, 255, 0.8)', maxWidth: 100 }}
                title={`Text will be typed into: ${targetWindow}`}
              >
                {targetWindow}
              </span>
            )}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: accentColor,
                boxShadow: `0 0 8px ${accentColor}`,
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
              Live
            </span>
          </div>
        )}

        {/* Right section for processing: target window */}
        {isProcessing && targetWindow && (
          <span
            className="text-[10px] font-medium truncate"
            style={{ color: 'rgba(100, 200, 255, 0.5)', maxWidth: 100 }}
            title={`Text will be typed into: ${targetWindow}`}
          >
            {targetWindow}
          </span>
        )}
      </div>

      {/* Bottom row: thin animated progress bar during processing */}
      {isProcessing && (
        <div
          style={{
            width: '85%',
            height: 3,
            borderRadius: 2,
            marginTop: 6,
            background: 'rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(96,165,250,0.6), rgba(147,130,255,0.6))',
              animation: 'progress-slide 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {/* Bottom row: subtle wave line during recording */}
      {isRecording && (
        <div
          style={{
            width: '90%',
            height: 2,
            borderRadius: 1,
            marginTop: 4,
            background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)`,
          }}
        />
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
        @keyframes spin-reverse {
          to { transform: rotate(-360deg); }
        }
        @keyframes audio-bar-0 {
          0%, 100% { height: 4px; }
          25% { height: 22px; }
          75% { height: 8px; }
        }
        @keyframes audio-bar-1 {
          0%, 100% { height: 6px; }
          40% { height: 26px; }
          60% { height: 10px; }
        }
        @keyframes audio-bar-2 {
          0%, 100% { height: 5px; }
          35% { height: 18px; }
          65% { height: 24px; }
        }
        @keyframes proc-wave {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
