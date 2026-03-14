// Deepgram WebSocket streaming transcription service
// Streams audio chunks in real-time and receives interim + final transcript results

export type TranscriptCallback = (text: string, isFinal: boolean) => void
export type ErrorCallback = (error: Error) => void

export class DeepgramStreamService {
  private ws: WebSocket | null = null
  private finalizedTranscript = ''
  private onTranscript: TranscriptCallback | null = null
  private onError: ErrorCallback | null = null
  private closeResolve: (() => void) | null = null

  get transcript(): string {
    return this.finalizedTranscript
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async start(
    apiKey: string,
    onTranscript: TranscriptCallback,
    onError: ErrorCallback
  ): Promise<void> {
    this.finalizedTranscript = ''
    this.onTranscript = onTranscript
    this.onError = onError

    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300', // ms of silence before finalizing a segment
    })

    return new Promise<void>((resolve, reject) => {
      // Auth via subprotocol keeps the API key out of the URL
      this.ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params}`,
        ['token', apiKey]
      )

      this.ws.onopen = () => {
        console.log('[Prattle] Deepgram WebSocket connected')
        resolve()
      }

      this.ws.onerror = () => {
        const error = new Error('Deepgram WebSocket connection failed')
        onError(error)
        reject(error)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'Results') {
            const alt = data.channel?.alternatives?.[0]
            if (!alt) return

            const segment = alt.transcript || ''
            if (!segment) return

            if (data.is_final) {
              // Confirmed segment — append to finalized transcript
              if (this.finalizedTranscript) {
                this.finalizedTranscript += ' ' + segment
              } else {
                this.finalizedTranscript = segment
              }
              onTranscript(this.finalizedTranscript, true)
            } else {
              // Interim result — show finalized + current partial
              const display = this.finalizedTranscript
                ? this.finalizedTranscript + ' ' + segment
                : segment
              onTranscript(display, false)
            }
          }
        } catch (e) {
          console.error('[Prattle] Failed to parse Deepgram message:', e)
        }
      }

      this.ws.onclose = (event) => {
        console.log(`[Prattle] Deepgram WebSocket closed (code: ${event.code})`)
        if (this.closeResolve) {
          this.closeResolve()
          this.closeResolve = null
        }
      }
    })
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk)
    }
  }

  async stop(): Promise<string> {
    if (!this.ws) return this.finalizedTranscript

    if (this.ws.readyState === WebSocket.OPEN) {
      // Tell Deepgram to flush remaining audio and close gracefully
      this.ws.send(JSON.stringify({ type: 'CloseStream' }))

      // Wait for Deepgram to send final results and close the connection
      await new Promise<void>((resolve) => {
        this.closeResolve = resolve
        // Safety timeout — don't hang forever if close never fires
        setTimeout(() => {
          this.closeResolve = null
          resolve()
        }, 3000)
      })
    }

    this.ws = null
    this.onTranscript = null
    this.onError = null

    return this.finalizedTranscript
  }

  abort(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.finalizedTranscript = ''
    this.onTranscript = null
    this.onError = null
  }
}

export const deepgramStreamService = new DeepgramStreamService()
