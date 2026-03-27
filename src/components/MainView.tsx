import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { speechService, isHallucinatedPhrase } from '../services/speechService'
import { deepgramStreamService } from '../services/deepgramStreamService'
import { analyzeEdits, buildProcessPrompt, buildRewritePrompt } from '../services/llmService'
import { transcribeViaProxy, processTextViaProxy, getStreamToken, submitRating } from '../services/proxyService'
import { DICTATION_MODES } from '../constants/modes'
import type { RecordingState } from '../constants/modes'
import {
  HiMicrophone, HiStop, HiClipboard, HiTrash,
  HiCheck, HiPaperAirplane, HiArrowPath,
} from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'

// Find simple word-level swaps between two texts
function findWordSwaps(original: string, corrected: string): { from: string; to: string }[] {
  const origWords = original.split(/\s+/)
  const corrWords = corrected.split(/\s+/)
  const swaps: { from: string; to: string }[] = []

  // Only detect swaps in texts of similar length (not major rewrites)
  if (Math.abs(origWords.length - corrWords.length) > 2) return swaps

  const minLen = Math.min(origWords.length, corrWords.length)
  for (let i = 0; i < minLen; i++) {
    const ow = origWords[i].replace(/[.,!?;:'"]/g, '')
    const cw = corrWords[i].replace(/[.,!?;:'"]/g, '')
    if (ow.toLowerCase() !== cw.toLowerCase() && ow.length > 1 && cw.length > 1) {
      swaps.push({ from: ow, to: cw })
    }
  }
  return swaps
}

// Count how many times a specific word swap appears in existing patterns
function countWordSwapInPatterns(patterns: any[], from: string, to: string): number {
  let count = 0
  for (const p of patterns) {
    if (!p.originalText || !p.correctedText) continue
    const swaps = findWordSwaps(p.originalText, p.correctedText)
    if (swaps.some(s => s.from.toLowerCase() === from.toLowerCase() && s.to.toLowerCase() === to.toLowerCase())) {
      count++
    }
  }
  return count
}

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
  const [trainingMode, setTrainingMode] = useState(false)
  const [trainingSaved, setTrainingSaved] = useState(false)
  const [pendingRating, setPendingRating] = useState<number>(0)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isHotkeyTriggered = useRef(false)
  const isProcessingRef = useRef(false)
  const recordingStartTime = useRef<number>(0)
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const isStreamingRef = useRef(false)

  // Recording session ID -- monotonically increasing counter.
  // Used to prevent stale callbacks and finally blocks from clobbering
  // a newer recording session's state.
  const recordingSessionId = useRef(0)

  const MIN_RECORDING_MS = 400

  const isRecording = recordingState === 'recording' || recordingState === 'rewrite_recording'
  const isProcessing = recordingState === 'processing'
  const isRewriteMode = recordingState === 'rewrite_recording'

  const currentMode = settings ? DICTATION_MODES[settings.currentModeIndex] : DICTATION_MODES[0]

  // Notify main process about committed text state
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.hasCommittedText(!!lastCommittedText)
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

    // Strict state guard: only start from idle.
    // If the previous recording is still processing, we must wait.
    // Without this, the second recording's stop() gets blocked by isProcessingRef
    // from the first recording, causing the second Deepgram session to never close
    // and its transcript to accumulate across sessions.
    const currentState = useAppStore.getState().recordingState
    if (currentState !== 'idle') {
      console.warn(`[Prattle] startRecording rejected -- state is ${currentState}`)
      return
    }

    // Assign a session ID for this recording. stopRecordingInternal captures
    // this value and only resets state if it still matches (prevents the finally
    // block from clobbering a newer recording session).
    const sessionId = ++recordingSessionId.current

    // Clear previous text and rating state BEFORE starting
    if (!rewrite) {
      setEditedText('')
      setRawText('')
      setProcessedText('')
      setPendingRating(0)
      setRatingSubmitted(false)
    }

    startPromiseRef.current = (async () => {
      try {
        // Step 1: Start recording IMMEDIATELY -- getUserMedia grabs the mic
        await speechService.startRecording()
        speechService.setMicGain(settings.micGain ?? 100)

        isStreamingRef.current = false
        recordingStartTime.current = Date.now()

        // Clear text again INSIDE the successful path (the outer clear at line 170
        // might have been overwritten by a late callback from the previous session)
        if (!rewrite) {
          setEditedText('')
          setRawText('')
          setProcessedText('')
        }

        // Show recording state RIGHT AWAY
        setRecordingState(rewrite ? 'rewrite_recording' : 'recording')
        setStatusMessage(rewrite ? 'Tell me how to change it...' : 'Listening...')

        if (!rewrite) {
          try {
            // Step 2: Tell DeepgramStreamService to start buffering audio BEFORE
            // the WebSocket exists. This is the critical fix for "garbled first words":
            // audio buffers from this moment, even while getStreamToken() is in-flight.
            deepgramStreamService.prepareForAudio()

            // Step 3: Start PCM capture -- audio flows to sendAudio() which buffers it
            const sampleRate = speechService.startPcmCapture((buffer) => {
              deepgramStreamService.sendAudio(buffer)
            })

            // Step 4: Network calls (token + WebSocket connect) happen AFTER audio is flowing.
            // The pre-connect buffer captures everything and replays on WebSocket open.
            const streamToken = await getStreamToken()

            await deepgramStreamService.start(
              streamToken,
              sampleRate,
              (text, _isFinal) => {
                // Session guard on the callback: only update UI if this is still
                // the current recording session
                if (recordingSessionId.current !== sessionId) return
                setEditedText(text)
              },
              (error) => {
                if (recordingSessionId.current !== sessionId) return
                // STREAM_CLOSED means Deepgram dropped the connection mid-recording
                // (e.g. their ~5min timeout). The transcript captured so far is still
                // valid -- just stop streaming and let the user know.
                if (error.message?.startsWith('STREAM_CLOSED:')) {
                  console.warn('[Prattle] Deepgram stream closed mid-recording -- keeping transcript so far')
                  isStreamingRef.current = false
                  speechService.stopPcmCapture()
                  setStatusMessage('Stream disconnected -- transcript captured so far is shown. Stop when ready.')
                  return
                }
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
            console.warn('[Prattle] Streaming failed, will use batch:', e?.message || e)
            speechService.stopPcmCapture()
            isStreamingRef.current = false
            setStatusMessage('Live preview unavailable -- will transcribe when you stop')
          }
        }
      } catch (error: any) {
        setStatusMessage(`Error: ${error.message}`)
        setRecordingState('idle')
      }
    })()
    await startPromiseRef.current
  }, [settings])

  const stopRecordingInternal = useCallback(async () => {
    if (!settings) return

    // Capture session ID at stop time -- the finally block checks this
    // to avoid clobbering a newer recording session
    const sessionId = recordingSessionId.current

    if (startPromiseRef.current) {
      // Wait for start to finish, but with a timeout to prevent hanging
      try {
        await Promise.race([
          startPromiseRef.current,
          new Promise(r => setTimeout(r, 10000)) // 10s max wait
        ])
      } catch {}
      startPromiseRef.current = null
    }

    if (isProcessingRef.current) return
    isProcessingRef.current = true

    const currentRecordingState = useAppStore.getState().recordingState
    if (currentRecordingState !== 'recording' && currentRecordingState !== 'rewrite_recording') {
      isProcessingRef.current = false
      return
    }

    const wasRewrite = currentRecordingState === 'rewrite_recording'
    const wasHotkey = isHotkeyTriggered.current
    isHotkeyTriggered.current = false

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

    // IMMEDIATELY stop sending audio to Deepgram. This is the fix for
    // "picks up ambient sounds after releasing the key" -- previously the PCM
    // processor kept running during the entire stop/processing sequence.
    if (isStreamingRef.current) {
      speechService.stopPcmCapture()
    }

    const audioStats = speechService.getAudioStats()
    const recordingDurationMs = Date.now() - recordingStartTime.current

    console.log(`[Prattle] Stop recording — streaming: ${isStreamingRef.current}, hotkey: ${wasHotkey}, duration: ${recordingDurationMs}ms, peak: ${audioStats.peakEnergy.toFixed(3)}, avg: ${audioStats.avgEnergy.toFixed(3)}, speechDetected: ${audioStats.speechDetected}`)

    setRecordingState('processing')
    setStatusMessage('Transcribing...')

    try {
      let transcription = ''

      if (isStreamingRef.current) {
        // PCM capture already stopped above -- just stop recording and get transcript
        await speechService.stopRecording()
        transcription = await deepgramStreamService.stop()
        isStreamingRef.current = false
      } else if (!wasHotkey && !audioStats.speechDetected) {
        console.log(`[Prattle] No speech detected (peak: ${audioStats.peakEnergy.toFixed(3)}, avg: ${audioStats.avgEnergy.toFixed(3)})`)
        await speechService.stopRecording()
        setStatusMessage('No speech detected. Try speaking louder or check your mic.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      } else {
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

      if (isHallucinatedPhrase(transcription)) {
        console.warn(`[Prattle] Blocked hallucinated phrase: "${transcription}"`)
        setStatusMessage('No speech detected. Try again.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }

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
        setStatusMessage('Rewriting...')
        const currentCommitted = useAppStore.getState().lastCommittedText
        const { systemPrompt, userMessage } = buildRewritePrompt(currentCommitted, transcription)
        const rewritten = await processTextViaProxy(userMessage, systemPrompt, settings.llmProvider)

        setProcessedText(rewritten)
        setEditedText(rewritten)
        setLastCommittedText(rewritten)

        if (wasHotkey) {
          await window.electronAPI.autoTypeText(rewritten)
        }

        setStatusMessage('Ready')
      } else {
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
        setEditedText(finalText + ' ')
        setLastCommittedText(finalText)
        setTrainingSaved(false)

        if (wasHotkey) {
          await window.electronAPI.autoTypeText(finalText + ' ')
        }

        setStatusMessage(trainingMode ? 'Edit the text above, then hit Save Training' : 'Ready')
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
      if (isStreamingRef.current) {
        speechService.stopPcmCapture()
        deepgramStreamService.abort()
        isStreamingRef.current = false
      }
      // Only reset state if we're still the active recording session.
      // Without this check, a rapid start-stop-start sequence causes the
      // first stop's finally block to clobber the second recording's state.
      if (recordingSessionId.current === sessionId) {
        setRecordingState('idle')
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
      }
      isProcessingRef.current = false
    }
  }, [settings, dictionary, learnedPatterns])

  const startRecordingRef = useRef(startRecordingInternal)
  const stopRecordingRef = useRef(stopRecordingInternal)
  useEffect(() => { startRecordingRef.current = startRecordingInternal }, [startRecordingInternal])
  useEffect(() => { stopRecordingRef.current = stopRecordingInternal }, [stopRecordingInternal])

  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand(async (command: string) => {
      switch (command) {
        case 'start':
        case 'start-handsfree': {
          // If still processing the previous recording, wait for it to finish
          // before starting a new one. This prevents overlapping sessions where
          // the second recording's stop() gets blocked by isProcessingRef.
          if (isProcessingRef.current) {
            console.log('[Prattle] Waiting for previous processing to complete before starting...')
            const maxWait = 50 // 50 * 100ms = 5s max
            for (let i = 0; i < maxWait && isProcessingRef.current; i++) {
              await new Promise(r => setTimeout(r, 100))
            }
          }
          isHotkeyTriggered.current = true
          startRecordingRef.current(false)
          break
        }
        case 'start-rewrite': {
          if (isProcessingRef.current) {
            const maxWait = 50
            for (let i = 0; i < maxWait && isProcessingRef.current; i++) {
              await new Promise(r => setTimeout(r, 100))
            }
          }
          isHotkeyTriggered.current = true
          startRecordingRef.current(true)
          break
        }
        case 'stop-capture':
          // Immediately stop sending audio to Deepgram (key released).
          // This prevents ambient noise capture during the 250ms double-tap delay.
          // The full 'stop' command (which triggers transcription) comes later.
          if (isStreamingRef.current) {
            speechService.stopPcmCapture()
            console.log('[Prattle] PCM capture stopped immediately on key release')
          }
          break
        case 'stop':
          stopRecordingRef.current()
          break
      }
    })

    return cleanup
  }, [])

  const handleToggleRecording = useCallback(async () => {
    if (!settings) return

    if (isRecording) {
      isHotkeyTriggered.current = false
      await stopRecordingInternal()
    } else if (isProcessing) {
      return
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

    await navigator.clipboard.writeText(editedText + ' ')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [editedText, processedText, settings, learnedPatterns])

  const handleAutoType = useCallback(async () => {
    if (!editedText.trim()) return
    setPasting(true)
    setStatusMessage('Typing to external window...')

    try {
      const success = await window.electronAPI.pasteToExternal(editedText + ' ')
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
    setTrainingSaved(false)
    setStatusMessage('Ready')
  }, [])

  const handleTrainingSave = useCallback(async () => {
    if (!processedText || !editedText || !settings || !learnedPatterns || !dictionary) return

    // If user didn't change anything, tell them
    if (processedText.trim() === editedText.trim()) {
      setStatusMessage('No changes detected. Edit the text first, then save.')
      return
    }

    setStatusMessage('Analyzing your corrections...')

    try {
      const modeId = DICTATION_MODES[settings.currentModeIndex]?.id || 'clean'
      const pattern = await analyzeEdits(processedText, editedText, modeId, settings)
      const messages: string[] = []

      if (pattern) {
        const newPattern = {
          id: uuidv4(),
          description: pattern.description,
          rule: pattern.rule,
          platform: modeId,
          createdAt: new Date().toISOString(),
          source: 'auto' as const,
          active: true,
          originalText: processedText.trim(),
          correctedText: editedText.trim(),
          action: 'prompt_rule' as const,
        }

        const updatedPatterns = [...learnedPatterns.patterns, newPattern]
        await saveLearnedPatternsToFile({ patterns: updatedPatterns })
        messages.push(`Learned: "${pattern.description}"`)

        // Auto-dictionary: find simple word swaps that have been corrected 3+ times
        const wordSwaps = findWordSwaps(processedText.trim(), editedText.trim())
        for (const swap of wordSwaps) {
          const swapCount = countWordSwapInPatterns(updatedPatterns, swap.from, swap.to)
          if (swapCount >= 3 && !dictionary.replacements[swap.from.toLowerCase()]) {
            // Auto-add to dictionary
            const updatedDict = {
              replacements: {
                ...dictionary.replacements,
                [swap.from.toLowerCase()]: swap.to,
              }
            }
            await saveDictionaryToFile(updatedDict)

            // Also log as a dictionary pattern
            const dictPattern = {
              id: uuidv4(),
              description: `Auto-added to dictionary: "${swap.from}" -> "${swap.to}"`,
              rule: `Always replace "${swap.from}" with "${swap.to}"`,
              platform: 'all',
              createdAt: new Date().toISOString(),
              source: 'auto' as const,
              active: true,
              action: 'dictionary_add' as const,
            }
            updatedPatterns.push(dictPattern)
            await saveLearnedPatternsToFile({ patterns: updatedPatterns })
            messages.push(`Added "${swap.from}" -> "${swap.to}" to dictionary (corrected 3+ times)`)
          }
        }
      } else {
        messages.push('Changes were too minor to extract a pattern. Try a more specific correction.')
      }

      setTrainingSaved(messages.length > 0 && !messages[0].includes('too minor'))
      setStatusMessage(messages.join(' | '))
    } catch (error: any) {
      setStatusMessage(`Training error: ${error.message}`)
    }
  }, [processedText, editedText, settings, learnedPatterns, dictionary])

  const handleRatingSubmit = useCallback(async () => {
    if (pendingRating < 1 || !rawText || !processedText) return
    setRatingSubmitted(true)
    const modeId = settings ? DICTATION_MODES[settings.currentModeIndex]?.id : undefined
    await submitRating(rawText, processedText, pendingRating, modeId)
  }, [pendingRating, rawText, processedText, settings])

  const handleCycleMode = useCallback(async () => {
    if (!settings) return
    const nextIndex = (settings.currentModeIndex + 1) % DICTATION_MODES.length
    const newSettings = { ...settings, currentModeIndex: nextIndex }
    await useAppStore.getState().saveSettingsToFile(newSettings)
  }, [settings])

  const getMicButtonClasses = () => {
    if (isProcessing) return 'bg-cd-mic-proc text-white cursor-not-allowed'
    if (isRewriteMode) return 'bg-cd-rewrite text-white scale-110'
    if (isRecording) return 'bg-cd-mic-rec text-white scale-110'
    return 'bg-cd-mic-idle text-gray-400 hover:bg-gray-700 hover:text-white hover:scale-105'
  }

  return (
    <div className="flex h-full p-4 gap-4">
      {/* Left panel: controls */}
      <div className="flex flex-col items-center gap-3 w-44 shrink-0">
        {/* Mode selector pill */}
        <button
          onClick={handleCycleMode}
          className="px-4 py-1.5 rounded-full text-sm font-medium bg-cd-card text-cd-accent border border-cd-accent/30 hover:border-cd-accent/60 transition-all"
        >
          {currentMode.name}
        </button>

        {/* Status message */}
        <p className="text-center text-xs text-cd-subtle leading-tight min-h-[2rem]">
          {statusMessage}
        </p>

        {/* Mic button */}
        <button
          onClick={handleToggleRecording}
          disabled={isProcessing}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${getMicButtonClasses()}`}
        >
          {(isRecording) && (
            <div className={`absolute inset-0 rounded-full ${isRewriteMode ? 'bg-cd-rewrite' : 'bg-cd-mic-rec'} recording-pulse`}></div>
          )}
          {isRecording ? (
            <HiStop className="w-8 h-8 relative z-10" />
          ) : isProcessing ? (
            <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <HiMicrophone className="w-8 h-8 relative z-10" />
          )}
        </button>

        {/* Recording timer + volume meter */}
        {isRecording && (
          <div className="text-center">
            <span className={`font-medium text-base ${isRewriteMode ? 'text-cd-rewrite' : 'text-cd-mic-rec'}`}>
              {formatDuration(recordingDuration)}
            </span>
            {audioData.length > 0 && (
              <div className="flex items-end justify-center gap-[2px] h-6 mt-1">
                {audioData.map((level, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full"
                    style={{
                      height: `${Math.max(2, level * 24)}px`,
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

        {/* Training mode toggle -- only visible when training is enabled in Settings */}
        {settings?.trainingEnabled && !isRecording && !isProcessing && (
          <button
            onClick={() => { setTrainingMode(!trainingMode); setTrainingSaved(false) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              trainingMode
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-cd-card text-cd-subtle border border-white/10 hover:text-cd-text hover:border-white/20'
            }`}
          >
            <div className={`w-7 h-3.5 rounded-full relative transition-all ${trainingMode ? 'bg-amber-500' : 'bg-gray-600'}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${trainingMode ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            Train
          </button>
        )}

        {/* Rewrite button */}
        {lastCommittedText && !isRecording && !isProcessing && (
          <button
            onClick={handleRewriteStart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-rewrite/20 text-cd-rewrite border border-cd-rewrite/30 hover:bg-cd-rewrite/30 transition-all"
          >
            <HiArrowPath className="w-3.5 h-3.5" />
            Rewrite
          </button>
        )}

        {/* Action buttons - stacked vertically */}
        {editedText && (
          <div className="flex flex-col gap-2 w-full mt-1">
            {/* Training save button - prominent when training mode is on */}
            {trainingMode && processedText && (
              <button
                onClick={handleTrainingSave}
                disabled={trainingSaved}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all shadow-sm w-full ${
                  trainingSaved
                    ? 'bg-green-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-black hover:shadow-md'
                }`}
                title="Save your corrections as a learning pattern"
              >
                {trainingSaved ? <HiCheck className="w-3.5 h-3.5" /> : '🧠'}
                {trainingSaved ? 'Learned!' : 'Save Training'}
              </button>
            )}

            <button
              onClick={handleCopy}
              disabled={!editedText}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm w-full
                ${copied
                  ? 'bg-green-500 text-white'
                  : 'bg-cd-accent hover:bg-cd-accent/80 text-white hover:shadow-md'
                }`}
              title="Copy to clipboard"
            >
              {copied ? <HiCheck className="w-3.5 h-3.5" /> : <HiClipboard className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              onClick={handleAutoType}
              disabled={pasting}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-rewrite hover:bg-cd-rewrite/80 text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50 w-full"
              title="Auto-type to active window"
            >
              <HiPaperAirplane className={`w-3.5 h-3.5 ${pasting ? 'animate-pulse' : ''}`} />
              Auto-Type
            </button>

            <button
              onClick={handleClear}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-card hover:bg-white/10 text-cd-subtle transition-all border border-white/10 w-full"
              title="Clear text"
            >
              <HiTrash className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Right panel: text area (fills remaining space) */}
      <div className="flex flex-col flex-1 min-w-0 gap-2">
        {/* Training mode banner */}
        {trainingMode && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-amber-400">
            Training mode: Speak, review the output, make corrections, then hit Save Training.
          </div>
        )}

        <div className={`bg-cd-card rounded-2xl border p-3 flex-1 flex flex-col ${
          trainingMode ? 'border-amber-500/30' : 'border-white/5'
        }`}>
          <textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => { setEditedText(e.target.value); setTrainingSaved(false) }}
            placeholder={isRecording
              ? "Recording in progress..."
              : trainingMode
                ? "Speak naturally, then edit the output to match how you actually want it..."
                : "Click the microphone to start dictating, or type directly here..."
            }
            className="w-full h-full bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-cd-text placeholder-cd-subtle/50 flex-1"
            style={{ fontSize: `${settings?.fontSize || 16}px`, minHeight: '100px' }}
          />
        </div>

        {/* AI output comparison (always show in training mode, collapsible otherwise) */}
        {trainingMode && processedText && editedText !== processedText && (
          <div className="p-2 bg-cd-card rounded-xl text-xs border border-white/5">
            <span className="text-amber-400 font-medium">AI gave you: </span>
            <span className="text-cd-subtle">{processedText}</span>
          </div>
        )}

        {/* Star rating -- shown once a processed result is ready */}
        {!trainingMode && processedText && !isRecording && !isProcessing && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-cd-subtle shrink-0">Rate this:</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => { if (!ratingSubmitted) setPendingRating(star) }}
                  disabled={ratingSubmitted}
                  className={`text-lg leading-none transition-colors ${
                    ratingSubmitted
                      ? star <= pendingRating ? 'text-amber-400' : 'text-white/10'
                      : star <= pendingRating ? 'text-amber-400 hover:text-amber-300' : 'text-white/20 hover:text-amber-300'
                  }`}
                  title={`Rate ${star} star${star !== 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
            {pendingRating > 0 && !ratingSubmitted && (
              <button
                onClick={handleRatingSubmit}
                className="text-xs px-2 py-0.5 rounded-lg bg-cd-accent hover:bg-cd-accent/80 text-white transition-colors"
              >
                Submit
              </button>
            )}
            {ratingSubmitted && (
              <span className="text-xs text-green-400">Thanks!</span>
            )}
          </div>
        )}

        {!trainingMode && rawText && (
          <div className="p-2 bg-cd-card rounded-xl border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-cd-subtle">Original transcript</span>
            </div>
            <p className="text-xs text-cd-subtle/80 leading-relaxed select-text">{rawText}</p>
          </div>
        )}
      </div>
    </div>
  )
}
