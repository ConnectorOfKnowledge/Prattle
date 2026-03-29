import { useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { speechService, isHallucinatedPhrase } from '../services/speechService'
import { deepgramStreamService } from '../services/deepgramStreamService'
import { buildProcessPrompt, buildRewritePrompt } from '../services/llmService'
import { transcribeViaProxy, processTextViaProxy, getStreamToken } from '../services/proxyService'
import { DICTATION_MODES } from '../constants/modes'
import { v4 as uuidv4 } from 'uuid'

const MIN_RECORDING_MS = 400

interface UseRecordingOptions {
  trainingMode: boolean
}

/**
 * Core recording hook. Encapsulates start/stop logic, IPC listener,
 * streaming, hallucination detection, and transcription/processing.
 *
 * CRITICAL: The session ID pattern prevents stale callbacks from
 * clobbering newer recording sessions. Do not simplify it.
 */
export function useRecording({ trainingMode }: UseRecordingOptions) {
  const {
    settings, dictionary, learnedPatterns,
    recordingState,
    setRecordingState, setRawText, setProcessedText,
    setEditedText, setLastCommittedText, setStatusMessage,
  } = useAppStore()

  const isHotkeyTriggered = useRef(false)
  const isProcessingRef = useRef(false)
  const recordingStartTime = useRef<number>(0)
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const isStreamingRef = useRef(false)

  // Recording session ID -- monotonically increasing counter.
  // Used to prevent stale callbacks and finally blocks from clobbering
  // a newer recording session's state.
  const recordingSessionId = useRef(0)

  const isRecording = recordingState === 'recording' || recordingState === 'rewrite_recording'
  const isProcessing = recordingState === 'processing'

  const startRecordingInternal = useCallback(async (rewrite: boolean) => {
    if (!settings) return

    // Strict state guard: only start from idle.
    const currentState = useAppStore.getState().recordingState
    if (currentState !== 'idle') {
      return
    }

    // Assign a session ID for this recording.
    const sessionId = ++recordingSessionId.current

    // Clear previous text and rating state BEFORE starting
    if (!rewrite) {
      setEditedText('')
      setRawText('')
      setProcessedText('')
    }

    startPromiseRef.current = (async () => {
      try {
        // Step 1: Start recording IMMEDIATELY -- getUserMedia grabs the mic
        await speechService.startRecording()
        speechService.setMicGain(settings.micGain ?? 100)

        isStreamingRef.current = false
        recordingStartTime.current = Date.now()

        // Clear text again INSIDE the successful path (the outer clear
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
            // Step 2: Buffer audio BEFORE the WebSocket exists
            deepgramStreamService.prepareForAudio()

            // Step 3: Start PCM capture -- audio flows to sendAudio() which buffers it
            const sampleRate = speechService.startPcmCapture((buffer) => {
              deepgramStreamService.sendAudio(buffer)
            })

            // Step 4: Network calls (token + WebSocket connect) happen AFTER audio is flowing
            const streamToken = await getStreamToken()

            await deepgramStreamService.start(
              streamToken,
              sampleRate,
              (text, _isFinal) => {
                // Session guard: only update UI if this is still the current session
                if (recordingSessionId.current !== sessionId) return
                setEditedText(text)
              },
              (error) => {
                if (recordingSessionId.current !== sessionId) return
                if (error.message?.startsWith('STREAM_CLOSED:')) {
                  isStreamingRef.current = false
                  speechService.stopPcmCapture()
                  setStatusMessage('Stream disconnected -- transcript captured so far is shown. Stop when ready.')
                  return
                }
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

    // Capture session ID at stop time
    const sessionId = recordingSessionId.current

    if (startPromiseRef.current) {
      try {
        await Promise.race([
          startPromiseRef.current,
          new Promise(r => setTimeout(r, 10000))
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

    // IMMEDIATELY stop sending audio to Deepgram
    if (isStreamingRef.current) {
      speechService.stopPcmCapture()
    }

    const audioStats = speechService.getAudioStats()
    const recordingDurationMs = Date.now() - recordingStartTime.current

    setRecordingState('processing')
    setStatusMessage('Transcribing...')

    try {
      let transcription = ''

      if (isStreamingRef.current) {
        await speechService.stopRecording()
        transcription = await deepgramStreamService.stop()
        isStreamingRef.current = false
      } else if (!wasHotkey && !audioStats.speechDetected) {
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
        setStatusMessage('Transcription seemed unreliable. Try again, speaking clearly.')
        setRecordingState('idle')
        isProcessingRef.current = false
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
        return
      }
      if (wordsPerSecond > 8) {
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

        // Save to history
        window.electronAPI.addHistoryEntry({
          id: uuidv4(),
          rawText: transcription,
          processedText: rewritten,
          mode: 'Rewrite',
          durationMs: recordingDurationMs,
          createdAt: new Date().toISOString(),
        }).catch(() => {})

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

        if (wasHotkey) {
          await window.electronAPI.autoTypeText(finalText + ' ')
        }

        // Save to history
        const modeName = DICTATION_MODES[modeIndex]?.name || `Mode ${modeIndex}`
        window.electronAPI.addHistoryEntry({
          id: uuidv4(),
          rawText: transcription,
          processedText: finalText,
          mode: modeName,
          durationMs: recordingDurationMs,
          createdAt: new Date().toISOString(),
        }).catch(() => {})

        setStatusMessage(trainingMode ? 'Edit the text above, then hit Save Training' : 'Ready')
      }
    } catch (error: any) {
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
      // Only reset state if we're still the active recording session
      if (recordingSessionId.current === sessionId) {
        setRecordingState('idle')
        if (window.electronAPI) window.electronAPI.hideIndicator?.()
      }
      isProcessingRef.current = false
    }
  }, [settings, dictionary, learnedPatterns, trainingMode])

  // Keep refs in sync for the IPC listener (which has [] deps)
  const startRecordingRef = useRef(startRecordingInternal)
  const stopRecordingRef = useRef(stopRecordingInternal)
  useEffect(() => { startRecordingRef.current = startRecordingInternal }, [startRecordingInternal])
  useEffect(() => { stopRecordingRef.current = stopRecordingInternal }, [stopRecordingInternal])

  // IPC listener for recording commands from main process
  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand(async (command: string) => {
      switch (command) {
        case 'start':
        case 'start-handsfree': {
          if (isProcessingRef.current) {
            const maxWait = 50
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
          if (isStreamingRef.current) {
            speechService.stopPcmCapture()
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
    if (!settings || !useAppStore.getState().lastCommittedText) return
    isHotkeyTriggered.current = false
    await startRecordingInternal(true)
  }, [settings, startRecordingInternal])

  return {
    isRecording,
    isProcessing,
    toggleRecording: handleToggleRecording,
    startRewrite: handleRewriteStart,
  }
}
