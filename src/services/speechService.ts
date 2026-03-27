// Speech-to-text service supporting multiple providers
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

// Known hallucination phrases that speech models produce from silence/noise.
// Whisper in particular loves to output these when given near-empty audio.
// Matched case-insensitively after trimming punctuation.
const HALLUCINATION_BLOCKLIST = [
  'the quick brown fox jumps over the lazy dog',
  'the quick brown fox',
  'thank you for watching',
  'thanks for watching',
  'subscribe to my channel',
  'please subscribe',
  'like and subscribe',
  'thank you for listening',
  'thanks for listening',
  'see you next time',
  'see you in the next video',
  'bye bye',
  'goodbye',
  'you',
  'bye',
  'i\'m sorry',
  'okay',
  'so',
  'um',
  'uh',
  'hmm',
  'mhm',
  'yeah',
  'oh',
  'ah',
  'huh',
]

/**
 * Check if transcription is a known hallucination phrase.
 * Strips punctuation and compares case-insensitively.
 */
function isHallucinatedPhrase(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.,!?;:'"()\[\]{}\-—…]/g, '').trim()
  return HALLUCINATION_BLOCKLIST.includes(normalized)
}

export class SpeechService {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private visualizationStream: MediaStream | null = null

  // Audio energy tracking — used to detect silence/noise-only recordings
  private energySamples: number[] = []
  private energyTrackingInterval: ReturnType<typeof setInterval> | null = null

  // Optional callback for streaming audio chunks to an external service (e.g. Deepgram WS)
  private onAudioChunk: ((chunk: Blob) => void) | null = null

  // Raw PCM capture for WebSocket streaming (taps into the AudioContext chain)
  private pcmProcessor: ScriptProcessorNode | null = null
  private onPcmData: ((buffer: ArrayBuffer) => void) | null = null

  // Resource tracking for leak prevention
  private activeRecordingId = 0
  private safetyTimeout: ReturnType<typeof setTimeout> | null = null

  async startRecording(): Promise<void> {
    const recordingId = ++this.activeRecordingId

    try {
      // Safety: if a previous recording wasn't cleaned up, do it now
      if (this.stream) {
        console.warn('[Prattle] Previous stream still active at startRecording -- cleaning up')
        this.cleanup()
      }

      // Use the simplest possible constraint -- { audio: true } is the most
      // compatible call and lets the browser pick the best device and settings.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      this.audioChunks = []
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType(),
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
          if (this.onAudioChunk) {
            this.onAudioChunk(event.data)
          }
        }
      }

      // Default onstop handler as safety net for unexpected stops (mic unplug, etc.)
      this.mediaRecorder.onstop = () => {
        console.warn('[Prattle] MediaRecorder stopped unexpectedly -- cleaning up')
        this.cleanup()
      }

      // Start recording IMMEDIATELY, BEFORE analyser setup.
      // The MediaRecorder works directly off the stream and doesn't need the
      // AudioContext graph. Setting up the analyser takes 50-150ms (AudioContext
      // init, node creation) and every ms of delay means lost words.
      this.mediaRecorder.start(100)

      // Set up audio visualization AFTER recording starts
      this.setupAnalyser(this.stream)

      // Start tracking audio energy for silence detection
      this.startEnergyTracking()

      // Clearable safety timeout (prevents orphaned mic streams from killing the driver)
      // 30 minutes -- long enough for extended rambling sessions, short enough to prevent
      // truly orphaned streams from holding the mic indefinitely
      if (this.safetyTimeout) clearTimeout(this.safetyTimeout)
      this.safetyTimeout = setTimeout(() => {
        this.safetyTimeout = null
        if (this.activeRecordingId === recordingId && this.stream) {
          console.error('[Prattle] Recording safety timeout (30 min) -- forcing cleanup')
          this.cleanup()
        }
      }, 30 * 60 * 1000)
    } catch (error: any) {
      // CRITICAL: clean up any partially-acquired resources on failure.
      // Without this, a failed startRecording leaves the mic stream open.
      this.cleanup()

      console.error('[Prattle] getUserMedia failed:', error?.name, error?.message)

      // Log device info for diagnostics
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices.filter(d => d.kind === 'audioinput')
        console.error('[Prattle] Audio inputs available:', mics.length,
          mics.map(d => ({ label: d.label || '(unlabeled)', id: d.deviceId.slice(0, 8) })))
      } catch (_) { /* ignore enumeration errors */ }

      if (error?.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied — open Windows Settings > Privacy & Security > Microphone and enable "Let desktop apps access your microphone"')
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        throw new Error('No microphone found — check that a mic is connected and enabled in Windows Sound Settings (right-click speaker icon > Sound settings > Input)')
      } else if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
        throw new Error('Microphone is busy — close other apps using the mic and try again')
      } else {
        throw new Error(`Microphone error (${error?.name}): ${error?.message || 'unknown'}`)
      }
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.cleanup() // Safety cleanup in case stream is dangling
        reject(new Error('No recording in progress'))
        return
      }

      // Check MediaRecorder state -- calling stop() on 'inactive' throws DOMException
      if (this.mediaRecorder.state === 'inactive') {
        console.warn('[Prattle] MediaRecorder already inactive at stopRecording')
        const audioBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() })
        this.cleanup()
        resolve(audioBlob)
        return
      }

      // IMMEDIATELY stop the mic stream tracks to prevent ambient noise capture.
      // The MediaRecorder has already buffered all audio up to this point.
      // Stopping tracks here means NO new audio enters the pipeline after the
      // user releases the hotkey, eliminating the "TV noise at the end" bug.
      // The MediaRecorder will still fire its final ondataavailable + onstop.
      if (this.stream) {
        this.stream.getTracks().forEach(track => {
          track.stop()
          console.log(`[Prattle] Stopped mic track immediately: ${track.label}`)
        })
      }

      // Timeout guard -- if onstop never fires (driver crash, etc.), force cleanup
      const timeout = setTimeout(() => {
        console.error('[Prattle] stopRecording timed out -- forcing cleanup')
        const audioBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() })
        this.cleanup()
        resolve(audioBlob)
      }, 5000)

      this.mediaRecorder.onstop = () => {
        clearTimeout(timeout)
        const audioBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() })
        this.cleanup()
        resolve(audioBlob)
      }

      this.mediaRecorder.stop()
    })
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    this.cleanup()
  }

  // Set up AudioContext + GainNode + AnalyserNode from a media stream.
  // REUSES the AudioContext across recordings to avoid exhausting the browser's
  // AudioContext limit (typically 6-8). Creating and closing contexts repeatedly
  // can also leak resources on some Windows audio drivers (Intel SST in particular).
  private setupAnalyser(stream: MediaStream): void {
    try {
      // Disconnect previous source if switching streams
      if (this.sourceNode) {
        try { this.sourceNode.disconnect() } catch {}
        this.sourceNode = null
      }

      // Reuse existing AudioContext if it's still alive
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext()
        console.log('[Prattle] Created new AudioContext (sampleRate:', this.audioContext.sampleRate, ')')
      }

      // Resume AudioContext if suspended (happens in hidden/background windows)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream)

      // Reuse gain + analyser nodes if they exist, create if not.
      // cleanup() disconnects them but keeps them alive to avoid AudioContext churn.
      if (!this.gainNode) {
        this.gainNode = this.audioContext.createGain()
        this.gainNode.gain.value = 1.0
      }

      if (!this.analyserNode) {
        this.analyserNode = this.audioContext.createAnalyser()
        this.analyserNode.fftSize = 256
        this.analyserNode.smoothingTimeConstant = 0.8
      }

      // Reconnect the full chain: source -> gain -> analyser
      // cleanup() disconnects these between recordings; we re-establish here
      this.sourceNode.connect(this.gainNode)
      this.gainNode.connect(this.analyserNode)
    } catch (error) {
      console.error('Failed to set up audio analyser:', error)
    }
  }

  // Set a callback to receive audio chunks in real-time (for streaming to external services)
  setAudioChunkCallback(callback: ((chunk: Blob) => void) | null): void {
    this.onAudioChunk = callback
  }

  // Start capturing raw PCM (int16) samples for WebSocket streaming.
  // Returns the AudioContext's sample rate so the caller can tell Deepgram.
  startPcmCapture(callback: (buffer: ArrayBuffer) => void): number {
    if (!this.audioContext || !this.analyserNode) {
      throw new Error('AudioContext not ready — call startRecording first')
    }

    this.onPcmData = callback

    // ScriptProcessorNode taps into the audio chain to get raw samples.
    // 4096 samples per buffer is a good balance between latency and overhead.
    this.pcmProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.pcmProcessor.onaudioprocess = (event) => {
      if (!this.onPcmData) return

      const float32 = event.inputBuffer.getChannelData(0)

      // Convert float32 (-1..1) to int16 (-32768..32767) for Deepgram's linear16 format
      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      this.onPcmData(int16.buffer)
    }

    // Insert into chain: analyser -> pcmProcessor -> destination (required for it to run)
    this.analyserNode.connect(this.pcmProcessor)
    this.pcmProcessor.connect(this.audioContext.destination)

    return this.audioContext.sampleRate
  }

  // Stop PCM capture and disconnect the processor node
  stopPcmCapture(): void {
    this.onPcmData = null
    if (this.pcmProcessor) {
      this.pcmProcessor.disconnect()
      this.pcmProcessor = null
    }
  }

  // Set mic gain (0-200 percentage, where 100 = normal)
  setMicGain(gain: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = gain / 100
    }
  }

  // Start tracking audio energy levels during recording
  // Uses setInterval instead of requestAnimationFrame so it works in
  // hidden/background windows (rAF pauses when window isn't visible)
  private startEnergyTracking(): void {
    this.energySamples = []
    if (!this.analyserNode) return

    const bufferLength = this.analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    this.energyTrackingInterval = setInterval(() => {
      if (!this.analyserNode) return
      this.analyserNode.getByteFrequencyData(dataArray)

      // Calculate RMS energy (0-1 range)
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const normalized = dataArray[i] / 255
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / bufferLength)
      this.energySamples.push(rms)
    }, 50) // Sample every 50ms
  }

  // Stop energy tracking
  private stopEnergyTracking(): void {
    if (this.energyTrackingInterval !== null) {
      clearInterval(this.energyTrackingInterval)
      this.energyTrackingInterval = null
    }
  }

  // Get audio stats from the recording session
  getAudioStats(): { peakEnergy: number; avgEnergy: number; speechDetected: boolean } {
    if (this.energySamples.length === 0) {
      return { peakEnergy: 0, avgEnergy: 0, speechDetected: false }
    }

    const peak = Math.max(...this.energySamples)
    const avg = this.energySamples.reduce((a, b) => a + b, 0) / this.energySamples.length

    // Speech threshold: average RMS > 0.02 and peak > 0.05
    // These are conservative — even quiet speech should clear this
    const speechDetected = avg > 0.02 && peak > 0.05

    return { peakEnergy: peak, avgEnergy: avg, speechDetected }
  }

  // Start audio visualization without recording (for browser speech provider)
  async startVisualization(): Promise<void> {
    if (this.analyserNode) return
    try {
      // Reuse the recording stream if one is already active — opening a second
      // getUserMedia stream can lock the mic on some Windows audio drivers.
      if (this.stream) {
        this.setupAnalyser(this.stream)
      } else {
        this.visualizationStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        this.setupAnalyser(this.visualizationStream)
      }
    } catch (error) {
      console.error('Failed to start visualization:', error)
    }
  }

  // Stop visualization-only stream (but keep AudioContext alive for reuse)
  stopVisualization(): void {
    if (this.visualizationStream) {
      this.visualizationStream.getTracks().forEach(t => t.stop())
      this.visualizationStream = null
    }
    // Only disconnect source, don't destroy AudioContext
    if (this.sourceNode) {
      try { this.sourceNode.disconnect() } catch {}
      this.sourceNode = null
    }
  }

  // Get the analyser node for reading frequency/volume data
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode
  }

  private cleanup(): void {
    this.stopEnergyTracking()
    this.stopPcmCapture()

    // Clear safety timeout so it doesn't accumulate closures over hours of use
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout)
      this.safetyTimeout = null
    }

    // Disconnect ALL audio graph nodes to release the OS audio pipeline.
    // On Intel SST drivers, connected nodes keep the driver's internal session
    // table alive even after the MediaStream tracks are stopped. Over hundreds
    // of recording cycles, this exhausts the driver and it crashes.
    if (this.sourceNode) {
      try { this.sourceNode.disconnect() } catch {}
      this.sourceNode = null
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect() } catch {}
      // Don't null -- will be reconnected in next setupAnalyser()
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect() } catch {}
      // Don't null -- will be reconnected in next setupAnalyser()
    }

    // ALWAYS stop the recording media stream tracks to release the mic hardware
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop()
      })
      this.stream = null
    }

    // ALSO stop any visualization-only stream (this was a major leak -- never
    // cleaned up before, each leaked stream held an exclusive mic lock)
    if (this.visualizationStream) {
      this.visualizationStream.getTracks().forEach(t => t.stop())
      this.visualizationStream = null
    }

    this.mediaRecorder = null
    this.audioChunks = []
  }

  // Light cleanup for analyser-only resources (visualization streams)
  private cleanupAnalyser(): void {
    if (this.sourceNode) {
      try { this.sourceNode.disconnect() } catch {}
      this.sourceNode = null
    }
    // DON'T close AudioContext here -- it gets reused across recordings
  }

  // Full teardown: closes AudioContext and releases everything.
  // Call this only on app shutdown, not between recordings.
  destroy(): void {
    this.cleanup()
    // Explicitly disconnect and null all nodes
    if (this.gainNode) {
      try { this.gainNode.disconnect() } catch {}
      this.gainNode = null
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect() } catch {}
      this.analyserNode = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      console.log('[Prattle] AudioContext closed (full destroy)')
    }
    this.audioContext = null
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }
    return 'audio/webm'
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }
}

// Transcribe audio using OpenAI Whisper API
export async function transcribeWithWhisper(audioBlob: Blob, apiKey: string): Promise<string> {
  if (audioBlob.size < 3000) return '' // Too small — would hallucinate

  const formData = new FormData()

  // Whisper expects a file, create one from the blob
  const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type })
  formData.append('file', audioFile)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')
  formData.append('response_format', 'text')
  formData.append('temperature', '0') // Reduce hallucination — 0 = most deterministic
  // Prompt hint helps Whisper understand context and reduces hallucination on short clips
  formData.append('prompt', 'Voice dictation transcription.')

  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Whisper API error: ${response.status} - ${error}`)
  }

  return (await response.text()).trim()
}

// Transcribe using Deepgram API
export async function transcribeWithDeepgram(audioBlob: Blob, apiKey: string): Promise<string> {
  if (audioBlob.size < 3000) return '' // Too small — would hallucinate

  const arrayBuffer = await audioBlob.arrayBuffer()

  // Scale timeout with audio size: 15s base + 1s per MB of audio
  // A 30-min webm/opus recording is roughly 3-5MB, so this gives plenty of headroom
  const timeoutMs = 15000 + Math.ceil(audioBlob.size / (1024 * 1024)) * 1000

  const response = await fetchWithTimeout('https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type,
    },
    body: arrayBuffer,
    timeout: timeoutMs,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Deepgram API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const alternative = result.results?.channels?.[0]?.alternatives?.[0]
  if (!alternative) return ''

  // Check confidence — reject low-confidence transcriptions that are likely noise
  const confidence = alternative.confidence ?? 1
  if (confidence < 0.4) {
    console.log(`[Prattle] Deepgram low confidence (${confidence.toFixed(2)}), rejecting transcription`)
    return ''
  }

  return alternative.transcript || ''
}

// Transcribe audio using Google Gemini (supports audio input natively)
export async function transcribeWithGemini(audioBlob: Blob, apiKey: string): Promise<string> {
  // Safety: reject tiny audio blobs that would cause hallucination
  // A 500ms webm/opus clip is typically 3-5KB; anything under 3KB is likely silence/noise
  if (audioBlob.size < 3000) {
    console.log(`[Prattle] Audio blob too small (${audioBlob.size} bytes), skipping transcription`)
    return ''
  }

  // Convert audio blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  // Determine the MIME type for Gemini
  const mimeType = audioBlob.type.split(';')[0] // e.g., "audio/webm"

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              }
            },
            {
              text: `Transcribe the exact words spoken in this audio. Output ONLY the spoken words, nothing else. No labels, no quotes, no commentary. Do NOT repeat or duplicate any part of the transcription. If silent or unclear, respond with exactly: [EMPTY]`
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
        }
      }),
      timeout: 30000,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini transcription error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

  // Catch hallucination markers and empty signals
  if (!text || text === '[EMPTY]' || text.toLowerCase() === 'empty' || text === '""' || text === "''") {
    return ''
  }

  // Strip any quotation marks Gemini might wrap around the transcription
  let cleaned = text.replace(/^["']|["']$/g, '').trim()

  // Detect and remove duplicated content (Gemini sometimes repeats the transcription)
  cleaned = removeDuplicatedContent(cleaned)

  return cleaned
}

// Detect and remove duplicated content in transcription output
// Gemini sometimes repeats the entire transcription or large chunks of it
function removeDuplicatedContent(text: string): string {
  if (text.length < 20) return text

  // Check if the text is roughly the same thing repeated (with some variation)
  const half = Math.floor(text.length / 2)
  const firstHalf = text.slice(0, half).trim().toLowerCase()
  const secondHalf = text.slice(half).trim().toLowerCase()

  // If the two halves are very similar (>80% overlap by words), take just the first half
  const firstWords = firstHalf.split(/\s+/)
  const secondWords = secondHalf.split(/\s+/)
  if (firstWords.length > 3 && secondWords.length > 3) {
    let matchCount = 0
    const minLen = Math.min(firstWords.length, secondWords.length)
    for (let i = 0; i < minLen; i++) {
      if (firstWords[i] === secondWords[i]) matchCount++
    }
    if (matchCount / minLen > 0.8) {
      console.log(`[Prattle] Detected duplicated transcription, using first half`)
      return text.slice(0, half).trim()
    }
  }

  // Also check for exact substring repetition (text appears twice in a row)
  for (let len = Math.floor(text.length / 2); len >= 10; len--) {
    const chunk = text.slice(0, len).trim()
    const rest = text.slice(len).trim()
    if (rest.toLowerCase().startsWith(chunk.toLowerCase())) {
      console.log(`[Prattle] Detected repeated substring in transcription`)
      return chunk
    }
  }

  return text
}

// Browser Web Speech API (free fallback)
export function transcribeWithBrowser(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      reject(new Error('Web Speech API not available'))
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = true

    let fullTranscript = ''

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          fullTranscript += event.results[i][0].transcript + ' '
        }
      }
    }

    recognition.onerror = (event: any) => {
      reject(new Error(`Speech recognition error: ${event.error}`))
    }

    recognition.onend = () => {
      resolve(fullTranscript.trim())
    }

    recognition.start()

    // Store reference for stopping later
    ;(window as any).__activeSpeechRecognition = recognition
  })
}

export function stopBrowserTranscription(): void {
  const recognition = (window as any).__activeSpeechRecognition
  if (recognition) {
    recognition.stop()
    ;(window as any).__activeSpeechRecognition = null
  }
}

export { isHallucinatedPhrase }
export const speechService = new SpeechService()
