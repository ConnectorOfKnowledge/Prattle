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
  private visualizationStream: MediaStream | null = null

  // Audio energy tracking — used to detect silence/noise-only recordings
  private energySamples: number[] = []
  private energyTrackingInterval: ReturnType<typeof setInterval> | null = null

  async startRecording(): Promise<void> {
    try {
      // Use the simplest possible constraint — { audio: true } is the most
      // compatible call and lets the browser pick the best device and settings.
      // Specific constraints like sampleRate can cause NotFoundError on some
      // devices that don't support the exact requested configuration.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Set up audio visualization from the recording stream
      this.setupAnalyser(this.stream)

      this.audioChunks = []
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType(),
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.start(100) // Collect data every 100ms

      // Start tracking audio energy for silence detection
      this.startEnergyTracking()
    } catch (error: any) {
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
        reject(new Error('No recording in progress'))
        return
      }

      // Timeout guard — if onstop never fires (driver crash, etc.), force cleanup
      // so the mic isn't left locked forever.
      const timeout = setTimeout(() => {
        console.error('[Prattle] stopRecording timed out — forcing cleanup')
        const audioBlob = new Blob(this.audioChunks, {
          type: this.getSupportedMimeType()
        })
        this.cleanup()
        resolve(audioBlob)
      }, 5000)

      this.mediaRecorder.onstop = () => {
        clearTimeout(timeout)
        const audioBlob = new Blob(this.audioChunks, {
          type: this.getSupportedMimeType()
        })
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

  // Set up AudioContext + GainNode + AnalyserNode from a media stream
  private setupAnalyser(stream: MediaStream): void {
    try {
      this.audioContext = new AudioContext()
      // Resume AudioContext if suspended (happens in hidden/background windows)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }
      const source = this.audioContext.createMediaStreamSource(stream)

      // Gain node for mic volume control (0-200% range)
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = 1.0 // Default 100%

      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      this.analyserNode.smoothingTimeConstant = 0.8

      // Chain: source -> gain -> analyser
      source.connect(this.gainNode)
      this.gainNode.connect(this.analyserNode)
    } catch (error) {
      console.error('Failed to set up audio analyser:', error)
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

  // Stop visualization-only stream
  stopVisualization(): void {
    if (this.visualizationStream) {
      this.visualizationStream.getTracks().forEach(t => t.stop())
      this.visualizationStream = null
    }
    this.cleanupAnalyser()
  }

  // Get the analyser node for reading frequency/volume data
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode
  }

  private cleanup(): void {
    this.stopEnergyTracking()
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.audioChunks = []
    this.cleanupAnalyser()
  }

  private cleanupAnalyser(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.analyserNode = null
    this.gainNode = null
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

  const response = await fetchWithTimeout('https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type,
    },
    body: arrayBuffer,
    timeout: 30000,
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
