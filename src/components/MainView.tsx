import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { speechService, isHallucinatedPhrase } from '../services/speechService'
import { deepgramStreamService } from '../services/deepgramStreamService'
import { analyzeEdits, buildProcessPrompt, buildRewritePrompt } from '../services/llmService'
import { transcribeViaProxy, processTextViaProxy, getStreamToken } from '../services/proxyService'
import { DICTATION_MODES } from '../constants/modes'
import type { RecordingState } from '../constants/modes'
import {
  HiMicrophone, HiStop, HiClipboard, HiTrash,
  HiCheck, HiPaperAirplane, HiArrowPath,
} from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'

export default function MainView() {
  const {
    settings, dictionary, learnedPatterns,
    recordingState, rawText, processedText, editedText, lastCommittedText,
    statusMessage, recordingDuration,
    setRecordingState, setRawText, setProcessedText,
    setEditedText, setLastCommittedText, setStatusMessage, setRecordingDuration, clearText,
    saveLearnedPatternsToFile, saveDictionaryToFile,
  } = useAppStore()

  const [copied, setCopied] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [audioData, setAudioData] = useState<number[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isHotkeyTriggered = useRef(false)
  const isProcessingRef = useRef(false) // Guard against duplicate stop calls
  const recordingStartTime = useRef<number>(0) // Timestamp when recording started
  const startPromiseRef = useRef<Promise<void> | null>(null) // Track pending recording start
  const isStreamingRef = useRef(false) // True when using Deepgram WebSocket streaming

  const MIN_RECORDING_MS = 400 // Minimum recording duration before we send to API

  const isRecording = recordingState === 'recording' || recordingState === 'rewrite_recording'
  const isProcessing = recordingState === 'processing'
  const isRewriteMode = recordingState === 'rewrite_recording'

  const currentMode = settings ? DICTATION_MODES[settings.currentModeIndex] : DICTATION_MODES[0]

  // Notify main process about committed text state (for rewrite mode detection)
  useEffect(() => {
    if (window.electronAPI) {
      const ipcRenderer = (window as any).require?.('electron')?.ipcRenderer
      // Use a simple approach: send via the existing IPC
      // The main process listens for 'has-committed-text'
    }
  }, [lastCommittedText])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        const current = useAppStore.getState().recordingDuration
        setRecordingDuration(current + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  // Audio visualization
  useEffect(() => {
    if (!isRecording) {
      setAudioData([])
      return
    }

    const analyser = speechService.getAnalyserNode()
    if (!analyser) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const NUM_BARS = 24
    let animId: number
    let lastUpdate = 0

    const update = (timestamp: number) => {
      animId = requestAnimationFrame(update)
      if (timestamp - lastUpdate < 33) return
      lastUpdate = timestamp

      analyser.getByteFrequencyData(dataArray)
      const step = Math.floor(bufferLength / NUM_BARS)
      const bars = Array.from({ length: NUM_BARS }, (_, i) => {
        const start = i * step
        const end = Math.min(start + step, bufferLength)
        let sum = 0
        for (let j = start; j < end; j++) sum += dataArray[j]
        return (sum / (end - start)) / 255
      })
      setAudioData(bars)
    }

    animId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animId)
  }, [isRecording])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const startRecordingInternal = useCallback(async (rewrite: boolean) => {
    if (!settings) return

    // Store the start promise so stopRecording can wait for it
    // (getUserMedia can take 500ms+, and stop might arrive before it resolves)
    startPromiseRef.current = (async () => {
      try {
        await speechService.startRecording()

        // Apply mic gain setting
        speechService.setMicGain(settings.micGain ?? 100)

        // Set up Deepgram WebSocket streaming (not for rewrite mode)
        isStreamingRef.current = false

        if (!rewrite) {
          try {
            const streamToken = await getStreamToken()
            const sampleRate = speechService.startPcmCapture((buffer) => {
              deepgramStreamService.sendAudio(buffer)
            })

            await deepgramStreamService.start(
              streamToken,
              sampleRate,
              (text, _isFinal) => {
                setEditedText(text)
              },
              (error) => {
                console.error('[Prattle] Deepgram stream error:', error)
                isStreamingRef.current = false
                speechService.stopPcmCapture()
              }
            )
            isStreamingRef.current = true
          } catch (e: any) {
            if (e.message === 'TRIAL_EXPIRED') {
              setStatusMessage('Trial expired. Subscribe to continue using Prattle.')
              setRecordingState('idle')
              await speechService.stopRecording()
              return
            }
            console.warn('[Prattle] Streaming failed, will use batch:', e)
            speechService.stopPcmCapture()
            isStreamingRef.current = false
          }
        }

        recordingStartTime.current = Date.now()
        setRecordingState(rewrite ? 'rewrite_recording' : 'recording')
        setStatusMessage(rewrite ? 'Tell me how to change it...' : 'Listening...')
      } catch (error: any) {
        setStatusMessage(`Error: ${error.message}`)
        setRecordingState('idle')
      }
    })()
    await startPromiseRef.current
  }, [settings])

  const stopRecordingInternal = useCallback(async () => {
    if (!settings) return

    // Wait for any pending recording start to finish before stopping
    if (startPromiseRef.current) {
      try { await startPromiseRef.current } catch {}
      startPromiseRef.current = null
    }

    // Guard: prevent duplicate stop calls
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    const currentRecordingState = useAppStore.getState().recordingState
    if (currentRecordingState !== 'recording' && currentRecordingState !== 'rewrite_recording') {
      isProcessingRef.current = false
      return // Not actually recording -- ignore stale stop
    }

    const wasRewrite = currentRecordingState === 'rewrite_recording'
    const wasHotkey = isHotkeyTriggered.current
    isHotkeyTriggered.current = false

    // Guard: discard recordings shorter than MIN_RECORDING_MS
    const elapsed = Date.now() - recordingStartTime.current
    if (elapsed < MIN_RECORDING_MS) {
      if (isStreamingRef.current) {
        speechService.stopPcmCapture()
        deepgramStreamService.abort()
        isStreamingRef.current = false
        setEditedText('')
      }
      await speechService.stopRecording()
      setStatusMessage('Recording too short -- hold longer to dictate')
      setRecordingState('idle')
      isProcessingRef.current = false
      if (window.electronAPI) window.electronAPI.hideIndicator?.()
      return
    }

    // Check audio energy before sending to any API
    const audioStats = speechService.getAudioStats()
    const recordingDurationMs = Date.now() - recordingStartTime.current

    setRecordingState('processing')
    setStatusMessage('Transcribing...')

    // Capture whether there's previous committed text (for auto-type spacing)
    const hadPreviousText = !!useAppStore.getState().lastCommittedText

    try {
      let transcription = ''

      if (isStreamingRef.current) {
        // Deepgram WebSocket streaming -- transcript accumulated in real-time
        speechService.stopPcmCapture()
        await speechService.stopRecording()
        transcription = await deepgramStreamService.stop()
        isStreamingRef.current = false
      } else if (!wasHotkey && !audioStats.speechDetected) {
        // No speech energy detected -- don't waste an API call
        console.log(`[Prattle] No speech detected (peak: ${audioStats.peakEnergy.toFixed(3)}, avg: ${audioStats.avgEnergy.toFixed(3)})`)
        await speechService.stopRecording()
        setStatusMessage('No speech detected. Try speaking louder or check your mic.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      } else {
        // Batch transcription via proxy
        const audioBlob = await speechService.stopRecording()
        transcription = await transcribeViaProxy(audioBlob, 'deepgram')
      }

      if (!transcription.trim()) {
        setStatusMessage('No speech detected. Try again.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }

      // Block known hallucination phrases
      if (isHallucinatedPhrase(transcription)) {
        console.warn(`[Prattle] Blocked hallucinated phrase: "${transcription}"`)
        setStatusMessage('No speech detected. Try again.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }

      // Post-transcription sanity check: detect hallucinated output
      const wordCount = transcription.trim().split(/\s+/).length
      const recordingSeconds = recordingDurationMs / 1000
      const wordsPerSecond = wordCount / recordingSeconds

      if (recordingSeconds < 3 && wordsPerSecond > 6) {
        console.warn(`[Prattle] Suspicious transcription: ${wordCount} words in ${recordingSeconds.toFixed(1)}s (${wordsPerSecond.toFixed(1)} wps)`)
        console.warn(`[Prattle] Rejected text: "${transcription}"`)
        setStatusMessage('Transcription seemed unreliable. Try again, speaking clearly.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }
      if (wordsPerSecond > 8) {
        console.warn(`[Prattle] Hallucination detected: ${wordCount} words in ${recordingSeconds.toFixed(1)}s (${wordsPerSecond.toFixed(1)} wps)`)
        console.warn(`[Prattle] Rejected text: "${transcription}"`)
        setStatusMessage('Transcription seemed unreliable. Try again, speaking clearly.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }

      if (wasRewrite) {
        // Rewrite mode: use the transcription as an instruction to modify lastCommittedText
        setStatusMessage('Rewriting...')
        const currentCommitted = useAppStore.getState().lastCommittedText
        const { systemPrompt, userMessage } = buildRewritePrompt(currentCommitted, transcription)
        const rewritten = await processTextViaProxy(userMessage, systemPrompt, settings.llmProvider)

        setProcessedText(rewritten)
        setLastCommittedText(rewritten)

        if (wasHotkey) {
          await window.electronAPI.autoTypeText(rewritten)
        }

        setStatusMessage('Ready')
      } else {
        // Normal dictation mode
        setRawText(transcription)
        setStatusMessage('Cleaning your text...')

        const modeIndex = settings.currentModeIndex
        let finalText: string

        const promptData = buildProcessPrompt(
          transcription, modeIndex,
          dictionary || { replacements: {} },
          learnedPatterns?.patterns || [],
          settings
        )
        if (promptData) {
          finalText = await processTextViaProxy(
            promptData.userMessage, promptData.systemPrompt, settings.llmProvider
          )
        } else {
          finalText = transcription
        }

        setProcessedText(finalText)
        setLastCommittedText(finalText)

        if (wasHotkey) {
          // Prepend a space when there was previous text so consecutive
          // dictations don't smash together in the target app
          const textToType = hadPreviousText ? ' ' + finalText : finalText
          await window.electronAPI.autoTypeText(textToType)
        }

        setStatusMessage('Ready')
      }
    } catch (error: any) {
      console.error('Transcription/processing error:', error)
      if (error.message === 'TRIAL_EXPIRED' || error.message?.includes('Trial expired')) {
        setStatusMessage('Your trial has expired. Subscribe to continue using Prattle.')
      } else if (error.message === 'Not authenticated') {
        setStatusMessage('Please sign in to use Prattle.')
        useAppStore.getState().setCurrentView('auth')
      } else {
        setStatusMessage(`Error: ${error.message}`)
      }
    } finally {
      // Clean up streaming if it's still active (e.g. after an error)
      if (isStreamingRef.current) {
        speechService.stopPcmCapture()
        deepgramStreamService.abort()
        isStreamingRef.current = false
      }
      setRecordingState('idle')
      isProcessingRef.current = false
      // Always hide the floating indicator when processing completes (success or error)
      if (window.electronAPI) window.electronAPI.hideIndicator?.()
    }
  }, [settings, dictionary, learnedPatterns])

  // Keep refs to the latest callback functions so the IPC listener doesn't need re-registering
  const startRecordingRef = useRef(startRecordingInternal)
  const stopRecordingRef = useRef(stopRecordingInternal)
  useEffect(() => { startRecordingRef.current = startRecordingInternal }, [startRecordingInternal])
  useEffect(() => { stopRecordingRef.current = stopRecordingInternal }, [stopRecordingInternal])

  // Listen for hotkey recording commands from main process -- register ONCE on mount
  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand((command: string) => {
      switch (command) {
        case 'start':
        case 'start-handsfree':
          isHotkeyTriggered.current = true
          startRecordingRef.current(false)
          break
        case 'start-rewrite':
          isHotkeyTriggered.current = true
          startRecordingRef.current(true)
          break
        case 'stop':
          stopRecordingRef.current()
          break
      }
    })

    return cleanup
  }, []) // Empty deps -- only register once

  const handleToggleRecording = useCallback(async () => {
    if (!settings) return

    if (isRecording) {
      isHotkeyTriggered.current = false
      await stopRecordingInternal()
    } else if (isProcessing) {
      return // Don't interrupt processing
    } else {
      isHotkeyTriggered.current = false
      await startRecordingInternal(false)
    }
  }, [isRecording, isProcessing, settings, startRecordingInternal, stopRecordingInternal])

  const handleRewriteStart = useCallback(async () => {
    if (!settings || !lastCommittedText) return
    isHotkeyTriggered.current = false
    await startRecordingInternal(true)
  }, [settings, lastCommittedText, startRecordingInternal])

  const handleCopy = useCallback(async () => {
    if (!editedText.trim()) return

    // Analyze edits for pattern learning
    if (processedText && editedText !== processedText && settings && learnedPatterns) {
      try {
        const modeId = DICTATION_MODES[settings.currentModeIndex]?.id || 'clean'
        const pattern = await analyzeEdits(processedText, editedText, modeId, settings)

        if (pattern) {
          const newPattern = {
            id: uuidv4(),
            description: pattern.description,
            rule: pattern.rule,
            platform: modeId,
            createdAt: new Date().toISOString(),
            source: 'auto' as const,
            active: true,
          }

          const updated = {
            patterns: [...learnedPatterns.patterns, newPattern]
          }
          await saveLearnedPatternsToFile(updated)
          setStatusMessage('Copied! Learned a new pattern.')
        } else {
          setStatusMessage('Copied to clipboard!')
        }
      } catch {
        setStatusMessage('Copied to clipboard!')
      }
    } else {
      setStatusMessage('Copied to clipboard!')
    }

    await navigator.clipboard.writeText(editedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [editedText, processedText, settings, learnedPatterns])

  const handleAutoType = useCallback(async () => {
    if (!editedText.trim()) return
    setPasting(true)
    setStatusMessage('Typing to external window...')

    try {
      const success = await window.electronAPI.pasteToExternal(editedText)
      if (success) {
        setStatusMessage('Typed to external window!')
      } else {
        setStatusMessage('Auto-type failed - try copying manually')
      }
    } catch (error: any) {
      setStatusMessage(`Auto-type error: ${error.message}`)
    } finally {
      setPasting(false)
    }
  }, [editedText])

  const handleClear = useCallback(() => {
    clearText()
    setStatusMessage('Ready')
  }, [])

  // Cycle through modes
  const handleCycleMode = useCallback(async () => {
    if (!settings) return
    const nextIndex = (settings.currentModeIndex + 1) % DICTATION_MODES.length
    const newSettings = { ...settings, currentModeIndex: nextIndex }
    await useAppStore.getState().saveSettingsToFile(newSettings)
  }, [settings])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(150, textareaRef.current.scrollHeight)}px`
    }
  }, [editedText])

  // Mic button color/state
  const getMicButtonClasses = () => {
    if (isProcessing) return 'bg-cd-mic-proc text-white cursor-not-allowed'
    if (isRewriteMode) return 'bg-cd-rewrite text-white scale-110'
    if (isRecording) return 'bg-cd-mic-rec text-white scale-110'
    return 'bg-cd-mic-idle text-gray-400 hover:bg-gray-700 hover:text-white hover:scale-105'
  }

  return (
    <div className="flex flex-col h-full p-6 max-w-2xl mx-auto space-y-4">
      {/* Mode selector pill */}
      <div className="flex justify-center">
        <button
          onClick={handleCycleMode}
          className="px-4 py-1.5 rounded-full text-sm font-medium bg-cd-card text-cd-accent border border-cd-accent/30 hover:border-cd-accent/60 transition-all"
        >
          {currentMode.name}
        </button>
      </div>

      {/* Status message */}
      <p className="text-center text-sm text-cd-subtle">
        {statusMessage}
      </p>

      {/* Large mic button */}
      <div className="flex justify-center">
        <button
          onClick={handleToggleRecording}
          disabled={isProcessing}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${getMicButtonClasses()}`}
        >
          {(isRecording) && (
            <div className={`absolute inset-0 rounded-full ${isRewriteMode ? 'bg-cd-rewrite' : 'bg-cd-mic-rec'} recording-pulse`}></div>
          )}
          {isRecording ? (
            <HiStop className="w-10 h-10 relative z-10" />
          ) : isProcessing ? (
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <HiMicrophone className="w-10 h-10 relative z-10" />
          )}
        </button>
      </div>

      {/* Rewrite button */}
      {lastCommittedText && !isRecording && !isProcessing && (
        <div className="flex justify-center">
          <button
            onClick={handleRewriteStart}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cd-rewrite/20 text-cd-rewrite border border-cd-rewrite/30 hover:bg-cd-rewrite/30 transition-all"
          >
            <HiArrowPath className="w-4 h-4" />
            Rewrite
          </button>
        </div>
      )}

      {/* Volume meter */}
      {isRecording && (
        <div className="text-center">
          <span className={`font-medium text-lg ${isRewriteMode ? 'text-cd-rewrite' : 'text-cd-mic-rec'}`}>
            {formatDuration(recordingDuration)}
          </span>
          {audioData.length > 0 && (
            <div className="flex items-end justify-center gap-[2px] h-8 mt-2">
              {audioData.map((level, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full"
                  style={{
                    height: `${Math.max(3, level * 32)}px`,
                    backgroundColor: isRewriteMode
                      ? (level > 0.5 ? '#5856D6' : '#7B7AE0')
                      : (level > 0.65 ? '#E94560' : level > 0.35 ? '#f59e0b' : '#4ade80'),
                    transition: 'height 50ms ease-out',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text area */}
      <div className="bg-cd-card rounded-2xl border border-white/5 p-4">
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          placeholder={isRecording
            ? "Recording in progress..."
            : "Click the microphone to start dictating, or type directly here..."
          }
          className="w-full bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-cd-text placeholder-cd-subtle/50 min-h-[150px]"
          style={{ fontSize: `${settings?.fontSize || 16}px` }}
        />
      </div>

      {/* Action buttons */}
      {editedText && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleCopy}
            disabled={!editedText}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm
              ${copied
                ? 'bg-green-500 text-white'
                : 'bg-cd-accent hover:bg-cd-accent/80 text-white hover:shadow-md'
              }`}
            title="Copy to clipboard"
          >
            {copied ? <HiCheck className="w-4 h-4" /> : <HiClipboard className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={handleAutoType}
            disabled={pasting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-cd-rewrite hover:bg-cd-rewrite/80 text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50"
            title="Auto-type to active window"
          >
            <HiPaperAirplane className={`w-4 h-4 ${pasting ? 'animate-pulse' : ''}`} />
            Auto-Type
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-cd-card hover:bg-white/10 text-cd-subtle transition-all border border-white/10"
            title="Clear text"
          >
            <HiTrash className="w-4 h-4" />
            Clear
          </button>
        </div>
      )}

      {/* Raw text comparison */}
      {rawText && processedText && rawText !== processedText && (
        <details className="group">
          <summary className="text-xs text-cd-subtle cursor-pointer hover:text-cd-text transition-colors">
            View original transcription
          </summary>
          <div className="mt-2 p-3 bg-cd-card rounded-xl text-sm text-cd-subtle">
            {rawText}
          </div>
        </details>
      )}
    </div>
  )
}
