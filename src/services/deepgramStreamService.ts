// Deepgram WebSocket streaming transcription service
// Streams audio chunks in real-time and receives interim + final transcript results
//
// KEY DESIGN: Audio buffering for zero-latency start
// Audio chunks are buffered from the moment sendAudio() is called, even BEFORE
// the WebSocket object exists. When the WebSocket connects, all buffered chunks
// are replayed. This prevents the "garbled first words" problem.
//
// SESSION ISOLATION: Each start() gets a unique session ID. All callbacks
// (onmessage, onopen, onerror, onclose) check the session ID before acting.
// This prevents stale WebSocket events from corrupting the current recording.

export type TranscriptCallback = (text: string, isFinal: boolean) => void
export type ErrorCallback = (error: Error) => void

const WS_CONNECT_TIMEOUT_MS = 5000

export class DeepgramStreamService {
  private ws: WebSocket | null = null
  private finalizedTranscript = ''
  private onTranscript: TranscriptCallback | null = null
  private onError: ErrorCallback | null = null

  // Pre-connect audio buffer: captures PCM chunks before AND during WebSocket connect.
  // Unlike the previous design, this buffers even when this.ws is null (before start()
  // creates the WebSocket). This is critical because PCM capture starts before start().
  private preConnectBuffer: ArrayBuffer[] = []
  private wsReady = false

  // Session tracking: monotonically increasing counter. Each start() increments it.
  // All event handlers compare against their captured session ID before acting.
  private sessionId = 0

  // Track whether we're in a "preparing to stream" state (between prepareForAudio()
  // and the WebSocket connecting). sendAudio() buffers during this phase.
  private isBuffering = false

  // Connection timeout handle -- cleared on successful connect or abort
  private connectTimeout: ReturnType<typeof setTimeout> | null = null

  get transcript(): string {
    return this.finalizedTranscript
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // Call this BEFORE starting PCM capture to enable audio buffering.
  // This allows sendAudio() to buffer chunks even before start() creates the WebSocket.
  prepareForAudio(): void {
    this.preConnectBuffer = []
    this.isBuffering = true
    this.wsReady = false
  }

  async start(
    apiKey: string,
    sampleRate: number,
    onTranscript: TranscriptCallback,
    onError: ErrorCallback
  ): Promise<void> {
    // Kill any previous WebSocket that wasn't fully cleaned up
    if (this.ws) {
      console.warn('[Prattle] Previous WebSocket still alive at start() -- aborting it')
      this.abort()
    }

    // Increment session ID so stale callbacks get ignored
    const currentSession = ++this.sessionId

    this.finalizedTranscript = ''
    this.onTranscript = onTranscript
    this.onError = onError
    // Don't clear preConnectBuffer here -- it may already have buffered audio
    // from between prepareForAudio() and now
    this.wsReady = false

    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300',
      encoding: 'linear16',
      sample_rate: String(sampleRate),
      channels: '1',
    })

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params}`,
        ['token', apiKey]
      )

      // Connection timeout -- if WebSocket doesn't connect in time, fail gracefully
      this.connectTimeout = setTimeout(() => {
        this.connectTimeout = null
        if (this.sessionId !== currentSession) return
        console.error('[Prattle] WebSocket connection timeout')
        this.ws?.close()
        this.ws = null
        this.isBuffering = false
        reject(new Error('Deepgram WebSocket connection timeout'))
      }, WS_CONNECT_TIMEOUT_MS)

      // Capture a reference to the specific WebSocket for this session.
      // Using this.ws! in handlers is unsafe because this.ws could point
      // to a different WebSocket if start() is called again rapidly.
      const ws = this.ws

      ws.onopen = () => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout)
          this.connectTimeout = null
        }

        // Stale session check
        if (this.sessionId !== currentSession) {
          console.warn('[Prattle] Stale WebSocket connected (session mismatch) -- closing')
          ws.close()
          return
        }

        // Replay all audio captured while we were connecting (or before start() was called)
        for (const chunk of this.preConnectBuffer) {
          ws.send(chunk)
        }
        this.preConnectBuffer = []
        this.wsReady = true
        this.isBuffering = false

        resolve()
      }

      ws.onerror = () => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout)
          this.connectTimeout = null
        }
        this.preConnectBuffer = []
        this.wsReady = false
        this.isBuffering = false
        if (this.sessionId !== currentSession) return
        const error = new Error('Deepgram WebSocket connection failed')
        onError(error)
        reject(error)
      }

      ws.onmessage = (event) => {
        // Ignore messages from old sessions
        if (this.sessionId !== currentSession) return

        try {
          const data = JSON.parse(event.data)

          // Handle Deepgram error messages (not just Results)
          if (data.type === 'Error' || data.type === 'CloseStream') {
            console.error('[Prattle] Deepgram error:', data.message || data.description || data)
            onError(new Error(data.message || data.description || 'Deepgram stream error'))
            return
          }

          if (data.type === 'Results') {
            const alt = data.channel?.alternatives?.[0]
            if (!alt) return

            const segment = alt.transcript || ''
            if (!segment) return

            if (data.is_final) {
              if (this.finalizedTranscript) {
                this.finalizedTranscript += ' ' + segment
              } else {
                this.finalizedTranscript = segment
              }
              onTranscript(this.finalizedTranscript, true)
            } else {
              const display = this.finalizedTranscript
                ? this.finalizedTranscript + ' ' + segment
                : segment
              onTranscript(display, false)
            }
          }
        } catch (error: unknown) {
          console.error('[Prattle] Failed to parse Deepgram message:', error)
        }
      }

      ws.onclose = (event) => {
        // Detect unexpected close during an active recording session (e.g. Deepgram timeout ~5min).
        // Code 1000 = clean close initiated by us; anything else = unexpected.
        // When the connection drops mid-recording, notify via onError so the UI can
        // inform the user that the stream ended -- but preserve any transcript already captured.
        if (this.sessionId === currentSession && this.wsReady && event.code !== 1000) {
          console.warn(`[Prattle] Deepgram stream closed unexpectedly (code ${event.code}) -- transcript preserved so far`)
          this.wsReady = false
          // Notify the caller so they can show an appropriate message
          if (this.onError) {
            this.onError(new Error(`STREAM_CLOSED:${event.code}`))
          }
        }

      }
    })
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.wsReady && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk)
    } else if (this.isBuffering || (this.ws && !this.wsReady)) {
      // Buffer audio when:
      // 1. isBuffering is true (prepareForAudio called, start() not yet called or connecting)
      // 2. WebSocket exists but not yet connected
      this.preConnectBuffer.push(chunk)
    }
    // If neither condition is true, audio is silently dropped (not recording)
  }

  async stop(): Promise<string> {
    // Immediately stop buffering and accepting new audio
    this.preConnectBuffer = []
    this.wsReady = false
    this.isBuffering = false

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }

    if (!this.ws) return this.finalizedTranscript

    const ws = this.ws
    const transcript = this.finalizedTranscript

    // Increment session ID to immediately invalidate all callbacks on this WebSocket.
    // This is the nuclear option: even if late messages arrive, they get dropped.
    this.sessionId++

    if (ws.readyState === WebSocket.OPEN) {
      // Send CloseStream to be polite, then close immediately.
      // We used to wait up to 3 seconds for Deepgram's final flush, but that
      // created a window where late callbacks could corrupt the next session.
      // The streaming transcript we already have is good enough -- the final
      // flush usually just adds a few trailing words.
      try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch {}
      try { ws.close() } catch {}
    } else {
      try { ws.close() } catch {}
    }

    this.ws = null
    this.onTranscript = null
    this.onError = null

    return transcript
  }

  abort(): void {
    // Increment session ID to invalidate any in-flight callbacks
    this.sessionId++

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this.preConnectBuffer = []
    this.wsReady = false
    this.isBuffering = false
    this.finalizedTranscript = ''
    this.onTranscript = null
    this.onError = null
  }
}

export const deepgramStreamService = new DeepgramStreamService()
