import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { speechService, transcribeWithWhisper, transcribeWithDeepgram, transcribeWithGemini, transcribeWithBrowser, stopBrowserTranscription } from '../services/speechService'
import { processText, analyzeEdits } from '../services/llmService'
import {
  HiMicrophone, HiStop, HiClipboard, HiTrash, HiArrowPath,
  HiCheck, HiArrowsPointingOut, HiArrowsPointingIn, HiClock,
  HiPaperAirplane, HiSparkles,
} from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'
import ChatPanel from './ChatPanel'

export default function MainView() {
  const {
    settings, platformPrompts, dictionary, learnedPatterns,
    isRecording, isProcessing, rawText, processedText, editedText,
    statusMessage, recordingDuration, focusMode, showHistory, history,
    processedTextByPlatform, editedTextByPlatform, processingPlatforms,
    setIsRecording, setIsProcessing, setRawText, setProcessedText,
    setEditedText, setStatusMessage, setRecordingDuration, clearText,
    setFocusMode, setShowHistory, addToHistory,
    setProcessedTextForPlatform, setEditedTextForPlatform, setProcessingPlatform,
    saveLearnedPatternsToFile, saveDictionaryToFile,
  } = useAppStore()

  const [copied, setCopied] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [audioData, setAudioData] = useState<number[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const browserTranscriptRef = useRef<Promise<string> | null>(null)
  const cursorPosRef = useRef<number | null>(null)

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

  // Audio visualization - read frequency data from analyser
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
      if (timestamp - lastUpdate < 33) return // ~30fps
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

  const handleToggleRecording = useCallback(async () => {
    if (!settings) return

    if (isRecording) {
      // Stop recording and transcribe
      setIsRecording(false)
      setStatusMessage('Transcribing...')
      setIsProcessing(true)

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
          setIsProcessing(false)
          return
        }

        setRawText(transcription)
        setStatusMessage('Processing with AI...')

        // Process through LLM if platform has a prompt
        const activePlatform = settings.activePlatform
        const prompt = platformPrompts?.[activePlatform]

        let finalText = transcription
        if (prompt && prompt.prompt && settings.autoProcess) {
          finalText = await processText(
            transcription,
            prompt,
            dictionary || { replacements: {} },
            learnedPatterns?.patterns || [],
            settings
          )
        }

        // Insert at cursor position if there's existing text, otherwise replace
        const existingText = useAppStore.getState().editedText
        let resultText = finalText
        if (existingText.trim()) {
          const pos = cursorPosRef.current ?? existingText.length
          const before = existingText.slice(0, pos)
          const after = existingText.slice(pos)
          const separator = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : ''
          resultText = before + separator + finalText + after
          setEditedText(resultText)
          setProcessedText(resultText)
        } else {
          setProcessedText(finalText)
          resultText = finalText
        }

        // Cache for the active platform
        setProcessedTextForPlatform(activePlatform, resultText)
        setEditedTextForPlatform(activePlatform, resultText)

        // Process all other enabled platforms in parallel for sidebar previews
        if (platformPrompts && settings.autoProcess) {
          // Platforms with prompts — process through LLM
          const otherWithPrompts = Object.entries(platformPrompts)
            .filter(([id, p]) => p.enabled && id !== activePlatform && p.prompt)

          otherWithPrompts.forEach(([id, platformPrompt]) => {
            setProcessingPlatform(id, true)
            processText(
              transcription,
              platformPrompt,
              dictionary || { replacements: {} },
              learnedPatterns?.patterns || [],
              settings
            ).then(processed => {
              setProcessedTextForPlatform(id, processed)
              setEditedTextForPlatform(id, processed)
            }).catch(err => {
              console.error(`Error processing platform ${id}:`, err)
            }).finally(() => {
              setProcessingPlatform(id, false)
            })
          })

          // Platforms without prompts (e.g., Raw) — just cache raw transcription
          Object.entries(platformPrompts).forEach(([id, p]) => {
            if (p.enabled && id !== activePlatform && !p.prompt) {
              setProcessedTextForPlatform(id, transcription)
              setEditedTextForPlatform(id, transcription)
            }
          })
        }

        cursorPosRef.current = null
        setStatusMessage('Ready - Edit below and copy when done')
      } catch (error: any) {
        console.error('Transcription error:', error)
        setStatusMessage(`Error: ${error.message}`)
      } finally {
        setIsProcessing(false)
      }
    } else {
      // Start recording
      try {
        cursorPosRef.current = textareaRef.current?.selectionStart ?? editedText.length
        const speechProvider = settings.speechProvider

        if (speechProvider === 'browser') {
          browserTranscriptRef.current = transcribeWithBrowser()
          // Start audio visualization separately for browser mode
          speechService.startVisualization()
        } else {
          await speechService.startRecording()
        }

        setIsRecording(true)
        setStatusMessage('Recording... Click stop when done')
      } catch (error: any) {
        setStatusMessage(`Error: ${error.message}`)
      }
    }
  }, [isRecording, settings, platformPrompts, dictionary, learnedPatterns, editedText])

  const handleReprocess = useCallback(async () => {
    if (!settings || !editedText.trim() || !platformPrompts) return

    setReprocessing(true)
    setStatusMessage('Reprocessing...')

    try {
      const activePlatform = settings.activePlatform
      const prompt = platformPrompts[activePlatform]

      if (prompt && prompt.prompt) {
        const processed = await processText(
          editedText,
          prompt,
          dictionary || { replacements: {} },
          learnedPatterns?.patterns || [],
          settings
        )
        setProcessedText(processed)
        setProcessedTextForPlatform(activePlatform, processed)
        setEditedTextForPlatform(activePlatform, processed)
        setStatusMessage('Reprocessed successfully')
      }
    } catch (error: any) {
      setStatusMessage(`Error: ${error.message}`)
    } finally {
      setReprocessing(false)
    }
  }, [editedText, settings, platformPrompts, dictionary, learnedPatterns])

  // Detect word-level corrections between two texts (for learning mode)
  const findWordCorrections = useCallback((original: string, edited: string): Array<{from: string, to: string}> => {
    const origWords = original.split(/\s+/).filter(w => w.length > 0)
    const editWords = edited.split(/\s+/).filter(w => w.length > 0)

    // Only works for texts of similar length (word corrections, not major rewrites)
    if (Math.abs(origWords.length - editWords.length) > Math.max(origWords.length, editWords.length) * 0.3) {
      return []
    }

    const corrections: Array<{from: string, to: string}> = []
    const minLen = Math.min(origWords.length, editWords.length)

    for (let i = 0; i < minLen; i++) {
      const orig = origWords[i].replace(/[.,!?;:'"()\-\[\]]/g, '')
      const edit = editWords[i].replace(/[.,!?;:'"()\-\[\]]/g, '')

      if (orig && edit && orig.toLowerCase() !== edit.toLowerCase() && orig.length > 1 && edit.length > 1) {
        corrections.push({ from: orig.toLowerCase(), to: edit })
      }
    }

    // Deduplicate
    const unique = new Map<string, string>()
    corrections.forEach(c => unique.set(c.from, c.to))
    return Array.from(unique.entries()).map(([from, to]) => ({ from, to }))
  }, [])

  const handleCopy = useCallback(async () => {
    if (!editedText.trim()) return

    let learnMessage = ''

    // Learning mode: auto-detect word corrections and add to dictionary
    if (settings?.learningMode && processedText && editedText !== processedText && dictionary) {
      const corrections = findWordCorrections(processedText, editedText)
      if (corrections.length > 0) {
        const updatedDict = { ...dictionary, replacements: { ...dictionary.replacements } }
        let addedCount = 0
        corrections.forEach(({ from, to }) => {
          if (!updatedDict.replacements[from]) {
            updatedDict.replacements[from] = to
            addedCount++
          }
        })
        if (addedCount > 0) {
          await saveDictionaryToFile(updatedDict)
          learnMessage = ` Learned ${addedCount} word correction${addedCount > 1 ? 's' : ''}.`
        }
      }
    }

    // Also analyze edits for pattern learning (existing behavior)
    if (processedText && editedText !== processedText && settings && learnedPatterns) {
      try {
        const pattern = await analyzeEdits(
          processedText,
          editedText,
          settings.activePlatform,
          settings
        )

        if (pattern) {
          const newPattern = {
            id: uuidv4(),
            description: pattern.description,
            rule: pattern.rule,
            platform: settings.activePlatform,
            createdAt: new Date().toISOString(),
            source: 'auto' as const,
            active: true,
          }

          const updated = {
            patterns: [...learnedPatterns.patterns, newPattern]
          }
          await saveLearnedPatternsToFile(updated)
          setStatusMessage(`Copied! Learned a new pattern.${learnMessage}`)
        } else {
          setStatusMessage(`Copied to clipboard!${learnMessage}`)
        }
      } catch {
        setStatusMessage(`Copied to clipboard!${learnMessage}`)
      }
    } else {
      setStatusMessage(`Copied to clipboard!${learnMessage}`)
    }

    await navigator.clipboard.writeText(editedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)

    // Save to history
    addToHistory({
      id: uuidv4(),
      text: editedText,
      platform: settings?.activePlatform || 'unknown',
      timestamp: new Date().toISOString(),
    })
  }, [editedText, processedText, settings, learnedPatterns, dictionary, findWordCorrections])

  const handlePaste = useCallback(async () => {
    if (!editedText.trim()) return
    setPasting(true)
    setStatusMessage('Pasting to external window...')

    try {
      const success = await window.electronAPI.pasteToExternal(editedText)
      if (success) {
        setStatusMessage('Pasted to external window!')
      } else {
        setStatusMessage('Paste failed - try copying manually')
      }
    } catch (error: any) {
      setStatusMessage(`Paste error: ${error.message}`)
    } finally {
      setPasting(false)
    }
  }, [editedText])

  const handleClear = useCallback(() => {
    clearText()
    setChatOpen(false)
    setStatusMessage('Ready')
  }, [])

  // Save current editedText to per-platform cache when it changes
  useEffect(() => {
    if (settings?.activePlatform && editedText) {
      setEditedTextForPlatform(settings.activePlatform, editedText)
    }
  }, [editedText, settings?.activePlatform])

  // Handle platform switching from sidebar
  const handlePlatformSelect = useCallback(async (platformId: string) => {
    if (!settings || !platformPrompts) return

    // Save current editedText to the cache for the current platform
    const currentPlatform = settings.activePlatform
    if (editedText) {
      setEditedTextForPlatform(currentPlatform, editedText)
    }

    // Update active platform
    const newSettings = { ...settings, activePlatform: platformId }
    await useAppStore.getState().saveSettingsToFile(newSettings)

    // Check if we have cached text for the new platform
    const cachedEdited = editedTextByPlatform[platformId]
    const cachedProcessed = processedTextByPlatform[platformId]

    if (cachedEdited) {
      // Restore from cache
      setEditedText(cachedEdited)
      setProcessedText(cachedProcessed || cachedEdited)
      setStatusMessage('Ready')
    } else if (rawText.trim()) {
      // Process on-demand for this platform
      setProcessingPlatform(platformId, true)
      setIsProcessing(true)
      setStatusMessage(`Processing for ${platformPrompts[platformId]?.name || platformId}...`)

      try {
        const prompt = platformPrompts[platformId]
        let processed = rawText
        if (prompt && prompt.prompt && settings.autoProcess) {
          processed = await processText(
            rawText,
            prompt,
            dictionary || { replacements: {} },
            learnedPatterns?.patterns || [],
            newSettings
          )
        }
        setProcessedText(processed)
        setProcessedTextForPlatform(platformId, processed)
        setEditedTextForPlatform(platformId, processed)
        setStatusMessage('Ready')
      } catch (error: any) {
        setStatusMessage(`Error: ${error.message}`)
      } finally {
        setProcessingPlatform(platformId, false)
        setIsProcessing(false)
      }
    } else {
      // No text to process, just clear
      setEditedText('')
      setProcessedText('')
    }
  }, [settings, platformPrompts, editedText, rawText, dictionary, learnedPatterns, editedTextByPlatform, processedTextByPlatform])

  // Expose platform select handler for the sidebar
  useEffect(() => {
    (window as any).__handlePlatformSelect = handlePlatformSelect
    return () => { delete (window as any).__handlePlatformSelect }
  }, [handlePlatformSelect])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(200, textareaRef.current.scrollHeight)}px`
    }
  }, [editedText])

  const hasSpeechKey = settings?.speechProvider === 'browser'
    || (settings?.speechProvider === 'gemini' && settings?.apiKeys?.gemini)
    || (settings?.speechProvider === 'whisper' && settings?.apiKeys?.openai)
    || (settings?.speechProvider === 'deepgram' && settings?.apiKeys?.deepgram)
  const hasLlmKey = settings?.apiKeys?.gemini || settings?.apiKeys?.claude || settings?.apiKeys?.openai

  const handleChatApply = (newText: string) => {
    setEditedText(newText)
    if (settings?.activePlatform) {
      setEditedTextForPlatform(settings.activePlatform, newText)
    }
  }

  const currentPlatformName = settings?.activePlatform && platformPrompts
    ? platformPrompts[settings.activePlatform]?.name || settings.activePlatform
    : ''

  return (
    <div className="flex h-full">
      <div className={`flex-1 p-4 mx-auto space-y-4 slide-in overflow-y-auto ${focusMode ? 'max-w-4xl' : 'max-w-2xl'}`}>
        {/* Top bar: focus mode, history */}
        <div className="flex justify-between items-center">
          <div>
            {!focusMode && currentPlatformName && (
              <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full">
                {currentPlatformName}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!focusMode && history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="btn-icon flex items-center gap-1 text-xs"
                title="History"
              >
                <HiClock className="w-4 h-4" />
                <span className="text-gray-500">History</span>
              </button>
            )}
            <button
              onClick={() => setFocusMode(!focusMode)}
              className="btn-icon flex items-center gap-1 text-xs"
              title={focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
            >
              {focusMode ? (
                <><HiArrowsPointingIn className="w-4 h-4" /><span className="text-gray-500">Exit Focus</span></>
              ) : (
                <><HiArrowsPointingOut className="w-4 h-4" /><span className="text-gray-500">Focus</span></>
              )}
            </button>
          </div>
        </div>

        {/* History panel */}
        {showHistory && !focusMode && (
          <div className="card max-h-60 overflow-y-auto">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Recent Copies</h3>
            <div className="space-y-2">
              {[...history].reverse().map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setEditedText(entry.text)
                    setShowHistory(false)
                    setStatusMessage('Loaded from history')
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-surface-100 transition-colors"
                >
                  <div className="text-sm text-gray-700 truncate">{entry.text}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {entry.platform} &middot; {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Setup warnings - hidden in focus mode */}
        {!focusMode && !hasSpeechKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Setup needed:</strong> Add a speech API key in Settings to enable voice transcription.
          </div>
        )}

        {!focusMode && !hasLlmKey && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <strong>Optional:</strong> Add an LLM API key in Settings (Gemini, Claude, or OpenAI)
            to enable smart text processing and learning.
          </div>
        )}

        {/* Action bar: action buttons flanking the record button */}
        <div className="flex items-center justify-center gap-3">
          {/* Left actions */}
          <div className={`flex items-center gap-1.5 ${editedText ? 'visible' : 'invisible'}`}>
            <button
              onClick={handleCopy}
              disabled={!editedText}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm
                ${copied
                  ? 'bg-green-500 text-white'
                  : 'bg-primary-500 hover:bg-primary-600 text-white hover:shadow-md'
                }`}
              title="Copy to clipboard"
            >
              {copied ? <HiCheck className="w-4 h-4" /> : <HiClipboard className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              onClick={handlePaste}
              disabled={!editedText || pasting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50"
              title="Paste to external window"
            >
              <HiPaperAirplane className={`w-4 h-4 ${pasting ? 'animate-pulse' : ''}`} />
              Paste
            </button>
          </div>

          {/* Center: Record button */}
          <button
            onClick={handleToggleRecording}
            disabled={isProcessing}
            className={`relative rounded-full flex items-center justify-center transition-all duration-300 shadow-lg
              ${focusMode ? 'w-14 h-14' : 'w-20 h-20'}
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white scale-110'
                : isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-500 hover:bg-primary-600 text-white hover:scale-105'
              }`}
          >
            {isRecording && (
              <div className="absolute inset-0 rounded-full bg-red-400 recording-pulse"></div>
            )}
            {isRecording ? (
              <HiStop className={`${focusMode ? 'w-6 h-6' : 'w-8 h-8'} relative z-10`} />
            ) : isProcessing ? (
              <div className="w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <HiMicrophone className={`${focusMode ? 'w-6 h-6' : 'w-8 h-8'} relative z-10`} />
            )}
          </button>

          {/* Right actions */}
          <div className={`flex items-center gap-1.5 ${editedText ? 'visible' : 'invisible'}`}>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-surface-200 hover:bg-surface-300 text-gray-600 transition-all"
              title="Clear text"
            >
              <HiTrash className="w-4 h-4" />
              Clear
            </button>

            {!focusMode && hasLlmKey && (
              <button
                onClick={handleReprocess}
                disabled={reprocessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-surface-200 hover:bg-surface-300 text-gray-600 transition-all disabled:opacity-50"
                title="Reprocess with AI"
              >
                <HiArrowPath className={`w-4 h-4 ${reprocessing ? 'animate-spin' : ''}`} />
                Redo
              </button>
            )}

            {!focusMode && hasLlmKey && editedText && (
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  chatOpen
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                }`}
                title="Modify with AI chat"
              >
                <HiSparkles className="w-4 h-4" />
                Modify
              </button>
            )}
          </div>
        </div>

        {/* Recording indicator with volume meter */}
        {isRecording && (
          <div className="text-center">
            <span className="text-red-500 font-medium text-lg">{formatDuration(recordingDuration)}</span>
            {/* Volume meter bars */}
            {audioData.length > 0 && (
              <div className="flex items-end justify-center gap-[2px] h-8 mt-2">
                {audioData.map((level, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full"
                    style={{
                      height: `${Math.max(3, level * 32)}px`,
                      backgroundColor: level > 0.65 ? '#ef4444' : level > 0.35 ? '#f59e0b' : '#4ade80',
                      transition: 'height 50ms ease-out',
                    }}
                  />
                ))}
              </div>
            )}
            {!focusMode && <p className="text-gray-500 text-sm mt-1">Recording... Click to stop</p>}
          </div>
        )}

        {/* Status */}
        {!isRecording && (
          <p className="text-center text-sm text-gray-500">{statusMessage}</p>
        )}

        {/* Text area */}
        <div className={focusMode ? '' : 'card'}>
          {!focusMode && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {editedText ? 'Your Text' : 'Transcription will appear here'}
              </span>
              {rawText && editedText !== rawText && (
                <span className="text-xs text-primary-500 font-medium">Edited</span>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            placeholder={isRecording
              ? "Recording in progress..."
              : "Click the microphone to start dictating, or type directly here..."
            }
            className={`textarea-field border-none p-0 focus:ring-0 ${focusMode ? 'min-h-[calc(100vh-220px)]' : 'min-h-[200px]'}`}
            style={{ fontSize: `${settings?.fontSize || 16}px` }}
          />
        </div>

        {/* Raw text comparison - hidden in focus mode */}
        {!focusMode && rawText && processedText && rawText !== processedText && (
          <details className="group">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
              View original transcription
            </summary>
            <div className="mt-2 p-3 bg-surface-100 rounded-xl text-sm text-gray-600">
              {rawText}
            </div>
          </details>
        )}
      </div>

      {/* Chat panel for text modification */}
      {chatOpen && settings && (
        <ChatPanel
          contextText={editedText}
          contextLabel={`Text for "${currentPlatformName}"`}
          systemInstruction={`You are helping the user refine their text. The current text is shown below. Help them make changes as requested. When you provide a modified version of the text, wrap the COMPLETE modified text in <modified> tags so it can be extracted and applied.\n\nCurrent text:\n${editedText}`}
          onApply={handleChatApply}
          onClose={() => setChatOpen(false)}
          settings={settings}
        />
      )}
    </div>
  )
}
