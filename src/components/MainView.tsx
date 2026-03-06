import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { speechService, transcribeWithWhisper, transcribeWithDeepgram, transcribeWithGemini, transcribeWithBrowser, stopBrowserTranscription } from '../services/speechService'
import { processText, rewriteText, analyzeEdits } from '../services/llmService'
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
  const browserTranscriptRef = useRef<Promise<string> | null>(null)
  const isHotkeyTriggered = useRef(false)

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

  // Listen for hotkey recording commands from main process
  useEffect(() => {
    if (!window.electronAPI?.onRecordingCommand) return

    const cleanup = window.electronAPI.onRecordingCommand((command: string) => {
      switch (command) {
        case 'start':
          isHotkeyTriggered.current = true
          startRecordingInternal(false)
          break
        case 'start-handsfree':
          isHotkeyTriggered.current = true
          startRecordingInternal(false)
          break
        case 'start-rewrite':
          isHotkeyTriggered.current = true
          startRecordingInternal(true)
          break
        case 'stop':
          stopRecordingInternal()
          break
      }
    })

    return cleanup
  }, [settings, dictionary, learnedPatterns, lastCommittedText])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const startRecordingInternal = useCallback(async (rewrite: boolean) => {
    if (!settings) return

    try {
      const speechProvider = settings.speechProvider

      if (speechProvider === 'browser') {
        browserTranscriptRef.current = transcribeWithBrowser()
        speechService.startVisualization()
      } else {
        await speechService.startRecording()
      }

      // Apply mic gain setting
      speechService.setMicGain(settings.micGain ?? 100)

      setRecordingState(rewrite ? 'rewrite_recording' : 'recording')
      setStatusMessage(rewrite ? 'Tell me how to change it...' : 'Listening...')
    } catch (error: any) {
      setStatusMessage(`Error: ${error.message}`)
      setRecordingState('idle')
    }
  }, [settings])

  const stopRecordingInternal = useCallback(async () => {
    if (!settings) return

    const currentRecordingState = useAppStore.getState().recordingState
    const wasRewrite = currentRecordingState === 'rewrite_recording'
    const wasHotkey = isHotkeyTriggered.current
    isHotkeyTriggered.current = false

    setRecordingState('processing')
    setStatusMessage('Transcribing...')

    try {
      let transcription = ''
      const speechProvider = settings.speechProvider

      if (speechProvider === 'browser') {
        stopBrowserTranscription()
        speechService.stopVisualization()
        transcription = browserTranscriptRef.current ? await browserTranscriptRef.current : ''
        browserTranscriptRef.current = null
      } else {
        const audioBlob = await speechService.stopRecording()

        if (speechProvider === 'gemini') {
          const key = settings.apiKeys.gemini
          if (!key) throw new Error('Google Gemini API key required. Add it in Settings.')
          transcription = await transcribeWithGemini(audioBlob, key)
        } else if (speechProvider === 'whisper') {
          const key = settings.apiKeys.openai
          if (!key) throw new Error('OpenAI API key required for Whisper. Add it in Settings.')
          transcription = await transcribeWithWhisper(audioBlob, key)
        } else if (speechProvider === 'deepgram') {
          const key = settings.apiKeys.deepgram
          if (!key) throw new Error('Deepgram API key required. Add it in Settings.')
          transcription = await transcribeWithDeepgram(audioBlob, key)
        }
      }

      if (!transcription.trim()) {
        setStatusMessage('No speech detected. Try again.')
        setRecordingState('idle')
        return
      }

      if (wasRewrite) {
        // Rewrite mode: use the transcription as an instruction to modify lastCommittedText
        setStatusMessage('Rewriting...')
        const currentCommitted = useAppStore.getState().lastCommittedText
        const rewritten = await rewriteText(currentCommitted, transcription, settings)
        setProcessedText(rewritten)
        setLastCommittedText(rewritten)

        if (wasHotkey) {
          // Auto-type the rewritten text
          await window.electronAPI.autoTypeText(rewritten)
        }

        setStatusMessage('Ready')
      } else {
        // Normal dictation mode
        setRawText(transcription)
        setStatusMessage('Cleaning your text...')

        const modeIndex = settings.currentModeIndex
        const finalText = await processText(
          transcription,
          modeIndex,
          dictionary || { replacements: {} },
          learnedPatterns?.patterns || [],
          settings
        )

        setProcessedText(finalText)
        setLastCommittedText(finalText)

        if (wasHotkey) {
          // Auto-type the processed text into the active field
          await window.electronAPI.autoTypeText(finalText)
        }

        setStatusMessage('Ready')
      }
    } catch (error: any) {
      console.error('Transcription/processing error:', error)
      setStatusMessage(`Error: ${error.message}`)
    } finally {
      setRecordingState('idle')
    }
  }, [settings, dictionary, learnedPatterns])

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

  const hasSpeechKey = settings?.speechProvider === 'browser'
    || (settings?.speechProvider === 'gemini' && settings?.apiKeys?.gemini)
    || (settings?.speechProvider === 'whisper' && settings?.apiKeys?.openai)
    || (settings?.speechProvider === 'deepgram' && settings?.apiKeys?.deepgram)
  const hasLlmKey = settings?.apiKeys?.gemini || settings?.apiKeys?.claude || settings?.apiKeys?.openai

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
        {isRecording ? statusMessage : isProcessing ? statusMessage : statusMessage}
      </p>

      {/* Setup warnings */}
      {!hasSpeechKey && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 text-sm text-amber-300">
          <strong>Setup needed:</strong> Add a speech API key in Settings to enable voice transcription.
        </div>
      )}

      {!hasLlmKey && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl px-4 py-3 text-sm text-blue-300">
          <strong>Optional:</strong> Add an LLM API key in Settings to enable smart text processing.
        </div>
      )}

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
