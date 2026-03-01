import { useState, useRef, useEffect, useCallback } from 'react'
import { speechService, transcribeWithWhisper, transcribeWithDeepgram, transcribeWithGemini, transcribeWithBrowser, stopBrowserTranscription } from '../services/speechService'
import { processText } from '../services/llmService'
import { HiMicrophone, HiStop, HiClipboard, HiPaperAirplane, HiXMark, HiCheck } from 'react-icons/hi2'
import type { Settings, PlatformPrompts, Dictionary, LearnedPatterns } from '../types'

export default function OverlayView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [platformPrompts, setPlatformPrompts] = useState<PlatformPrompts | null>(null)
  const [dictionary, setDictionary] = useState<Dictionary | null>(null)
  const [learnedPatterns, setLearnedPatterns] = useState<LearnedPatterns | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Ready — press record to start')
  const [copied, setCopied] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioData, setAudioData] = useState<number[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const browserTranscriptRef = useRef<Promise<string> | null>(null)

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      const [s, pp, d, lp] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getPlatformPrompts(),
        window.electronAPI.getDictionary(),
        window.electronAPI.getLearnedPatterns(),
      ])
      setSettings(s)
      setPlatformPrompts(pp)
      setDictionary(d)
      setLearnedPatterns(lp)
    }
    load()
  }, [])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isRecording])

  // Audio visualization
  useEffect(() => {
    if (!isRecording) { setAudioData([]); return }
    const analyser = speechService.getAnalyserNode()
    if (!analyser) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const NUM_BARS = 16
    let animId: number
    let lastUpdate = 0

    const update = (ts: number) => {
      animId = requestAnimationFrame(update)
      if (ts - lastUpdate < 33) return
      lastUpdate = ts
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

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const handleToggle = useCallback(async () => {
    if (!settings) return

    if (isRecording) {
      setIsRecording(false)
      setIsProcessing(true)
      setStatus('Transcribing...')

      try {
        let transcription = ''

        if (settings.speechProvider === 'browser') {
          stopBrowserTranscription()
          speechService.stopVisualization()
          transcription = browserTranscriptRef.current ? await browserTranscriptRef.current : ''
          browserTranscriptRef.current = null
        } else {
          const blob = await speechService.stopRecording()

          if (settings.speechProvider === 'gemini') {
            if (!settings.apiKeys.gemini) throw new Error('Gemini key required')
            transcription = await transcribeWithGemini(blob, settings.apiKeys.gemini)
          } else if (settings.speechProvider === 'whisper') {
            if (!settings.apiKeys.openai) throw new Error('OpenAI key required')
            transcription = await transcribeWithWhisper(blob, settings.apiKeys.openai)
          } else if (settings.speechProvider === 'deepgram') {
            if (!settings.apiKeys.deepgram) throw new Error('Deepgram key required')
            transcription = await transcribeWithDeepgram(blob, settings.apiKeys.deepgram)
          }
        }

        if (!transcription.trim()) {
          setStatus('No speech detected')
          setIsProcessing(false)
          return
        }

        setStatus('Processing...')
        const platform = platformPrompts?.[settings.activePlatform]
        let finalText = transcription

        if (platform?.prompt && settings.autoProcess) {
          finalText = await processText(
            transcription,
            platform,
            dictionary || { replacements: {} },
            learnedPatterns?.patterns || [],
            settings
          )
        }

        setText(finalText)
        setStatus('Ready — copy or paste')
      } catch (e: any) {
        setStatus(`Error: ${e.message}`)
      } finally {
        setIsProcessing(false)
      }
    } else {
      try {
        if (settings.speechProvider === 'browser') {
          browserTranscriptRef.current = transcribeWithBrowser()
          speechService.startVisualization()
        } else {
          await speechService.startRecording()
        }
        setIsRecording(true)
        setStatus('Recording...')
      } catch (e: any) {
        setStatus(`Error: ${e.message}`)
      }
    }
  }, [isRecording, settings, platformPrompts, dictionary, learnedPatterns])

  const handleCopy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setStatus('Copied!')
    setTimeout(() => setCopied(false), 1500)
  }

  const handlePaste = async () => {
    if (!text) return
    setStatus('Pasting...')
    try {
      const ok = await window.electronAPI.pasteFromOverlay(text)
      setStatus(ok ? 'Pasted!' : 'Paste failed')
    } catch {
      setStatus('Paste failed')
    }
  }

  const handleClose = () => window.close()

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRecording) handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isRecording])

  if (!settings) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 text-[10px] mt-2">Loading...</p>
      </div>
    )
  }

  // Get active platform name for display
  const activePlatformName = platformPrompts?.[settings.activePlatform]?.name || settings.activePlatform

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Title bar — draggable */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-surface-50 border-b border-surface-200 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">VoiceType</span>
          <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
            {activePlatformName}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <HiXMark className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Text preview */}
      <div className="flex-1 px-3 py-2 overflow-y-auto min-h-0">
        {text ? (
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">
            {isRecording ? 'Recording...' : isProcessing ? 'Processing...' : 'Press record to start'}
          </p>
        )}
      </div>

      {/* Volume meter */}
      {isRecording && audioData.length > 0 && (
        <div className="flex items-end justify-center gap-[2px] h-5 px-3 pb-1">
          {audioData.map((level, i) => (
            <div
              key={i}
              className="w-1 rounded-full"
              style={{
                height: `${Math.max(2, level * 20)}px`,
                backgroundColor: level > 0.65 ? '#ef4444' : level > 0.35 ? '#f59e0b' : '#4ade80',
                transition: 'height 50ms ease-out',
              }}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-surface-200 bg-surface-50">
        {/* Record / Stop button */}
        <button
          onClick={handleToggle}
          disabled={isProcessing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isRecording
              ? 'bg-red-500 text-white hover:bg-red-600'
              : isProcessing
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary-500 text-white hover:bg-primary-600'
          }`}
        >
          {isRecording ? <HiStop className="w-3.5 h-3.5" /> : <HiMicrophone className="w-3.5 h-3.5" />}
          {isRecording ? formatDuration(duration) : isProcessing ? 'Working...' : 'Record'}
        </button>

        <div className="flex-1" />

        {/* Status text */}
        <span className="text-[10px] text-gray-400 truncate max-w-[140px]">{status}</span>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          disabled={!text}
          className={`p-1.5 rounded-lg transition-all ${
            copied
              ? 'bg-green-500 text-white'
              : text
                ? 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                : 'bg-surface-100 text-gray-300 cursor-not-allowed'
          }`}
          title="Copy to clipboard"
        >
          {copied ? <HiCheck className="w-3.5 h-3.5" /> : <HiClipboard className="w-3.5 h-3.5" />}
        </button>

        {/* Paste to external */}
        <button
          onClick={handlePaste}
          disabled={!text}
          className={`p-1.5 rounded-lg transition-all ${
            text
              ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
              : 'bg-surface-100 text-gray-300 cursor-not-allowed'
          }`}
          title="Paste to external window"
        >
          <HiPaperAirplane className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
