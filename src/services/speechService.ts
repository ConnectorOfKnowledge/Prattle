// Speech-to-text service supporting multiple providers

export class SpeechService {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private visualizationStream: MediaStream | null = null

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      })

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
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw new Error('Microphone access denied or unavailable')
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'))
        return
      }

      this.mediaRecorder.onstop = () => {
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

  // Set up AudioContext + AnalyserNode from a media stream
  private setupAnalyser(stream: MediaStream): void {
    try {
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(stream)

      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      this.analyserNode.smoothingTimeConstant = 0.8

      source.connect(this.analyserNode)
    } catch (error) {
      console.error('Failed to set up audio analyser:', error)
    }
  }

  // Start audio visualization without recording (for browser speech provider)
  async startVisualization(): Promise<void> {
    if (this.analyserNode) return
    try {
      this.visualizationStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.setupAnalyser(this.visualizationStream)
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
  const formData = new FormData()

  // Whisper expects a file, create one from the blob
  const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type })
  formData.append('file', audioFile)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')
  formData.append('response_format', 'text')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Whisper API error: ${response.status} - ${error}`)
  }

  return (await response.text()).trim()
}

// Transcribe using Deepgram API
export async function transcribeWithDeepgram(audioBlob: Blob, apiKey: string): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer()

  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type,
    },
    body: arrayBuffer,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Deepgram API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
}

// Transcribe audio using Google Gemini (supports audio input natively)
export async function transcribeWithGemini(audioBlob: Blob, apiKey: string): Promise<string> {
  // Convert audio blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  // Determine the MIME type for Gemini
  const mimeType = audioBlob.type.split(';')[0] // e.g., "audio/webm"

  const response = await fetch(
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
              text: 'Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. No quotes, no labels, no commentary.'
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini transcription error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
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

export const speechService = new SpeechService()
